/*******************************************************************************
 * NSQ Protocol Frame and Transaction Semantics
 ******************************************************************************/

// Safe-ish callbacks
function nothing() {}
function _callback(something) {
    return (typeof something === "function") ? something : nothing;
}

var Net = require('net');
var Queue = require("qrly");
var Util = require("util");

var Message = require("../message");
var Policy = require("./policy");

var NSQProtocolError = function(code, params) {
    Error.call(this);

    this.code = code;
    this.message = params.message || NSQProtocolError.MESSAGES[code] || "Unknown error code";

    delete params.mesage;
    this.params = params || {};
};
Util.inherits(NSQProtocolError, Error);
NSQProtocolError.prototype.name = "NSQProtocolError";
NSQProtocolError.MESSAGES = {
    E_INVALID : "Invalid request. No soup for you.",
    E_BAD_BODY : "Bad request body",
    E_BAD_TOPIC : "Malformed topic string",
    E_BAD_CHANNEL : "Malformed channel string",
    E_BAD_MESSAGE : "Malformed payload message",
    E_PUB_FAILED : "Publish failed",
    E_MPUB_FAILED : "MPublish failed",
    E_FIN_FAILED : "Finish failed",
    E_REQ_FAILED : "Requeue failed",
    E_TOUCH_FAILED : "Touch failed",
    E_TIMEOUT : "No response received from the server",
    E_UNKNOWN : "Received unknown NSQ frame type",
    E_STATE : "Protocol instance is in an invalid state"
};

var Protocol = module.exports = function(connection) {
    var protocol = this;

    this.connection = connection;
    this.subscribed = false;
    this.timeout = 1000; // Default 1s transaction timeout
    this.reconnect = 2500; // Reconnect wait (falsey to disable reconnect)

    // Outgoing message buffer
    this.messages = new Queue({
        concurrency : 1,
        paused : true,
        flushable : false,
        collect : false
    });

    this.messages.worker = function(operation, done) {
        // Synthetic message. Nothing to send
        if (operation.flush) {
            connection.event("flush");
            done();
            return;
        }

        var timeout = null;
        if (operation.blocking) { // Start a transaction
            protocol.commit = function(err, status) {
                clearTimeout(timeout); // Clear transaction timeout
                delete protocol.commit; // Clear commit handle
                done(err, status);
            };
        }

        connection.event("send", operation);
        protocol.socket.write(operation.data, function() {
            if (operation.blocking) { // Set transaction timeout
                timeout = setTimeout(function() {
                    if (typeof protocol.commit === "function")
                        protocol.commit(new NSQProtocolError("E_TIMEOUT"));
                }, protocol.timeout);
            } else { // Just release the queue
                done();
            }
        });
    };
};
Protocol.NSQProtocolError = NSQProtocolError;

/**
 * Create a new TCP socket for the protocol instance
 */
Protocol.prototype.connect = function() {
    if (this.socket) // There can be only one!
        throw NSQProtocolError("E_STATE", {
            action : "connect",
            message : "Protocol instance already has an active socket!"
        });

    var protocol = this;
    var connection = this.connection
    var socket = this.socket = Net.connect(this.connection.client);

    socket.on("connect", function() {
        socket.write(Policy.VERSION); // Send MAGIC header
        protocol.messages.resume(); // Start sending queued messages
        connection.event("connect");

        if (protocol.disconnected) {
            delete protocol.disconnected;
            connection.event("reconnected");
        }
    });

    socket.on("data", framer.bind(this)); // Parse incoming frames
    socket.on("error", function(error) {
        connection.event("error", error);
    });

    // Handle disconnects
    socket.on("close", function() {
        protocol.disconnected = true;
        protocol.messages.pause();
        connection.event("close");

        delete protocol.socket;
        if (protocol.reconnect) { // Auto-Reconnect
            setTimeout(function() {
                connection.event("reconnect");
                protocol.connect();
            }, protocol.reconnect);
        }
    });
};

/**
 * Safely unsubscribe channel and close TCP socket
 */
Protocol.prototype.disconnect = function(callback) {
    var protocol = this;
    this.close(function(err, status) {
        protocol.socket.end();
        delete protocol.socket;

        _callback(callback)();
    });
};

/**
 * Parse incoming NSQ frames out of the TCP stream
 */
function framer(data) {
    var protocol = this;
    var connection = this.connection;

    var size = data.readInt32BE(0);
    var type = data.readInt32BE(4);
    var payload = data.slice(8, 4 + size);

    switch (type) {
    case 0: // Response/Control
        var message = payload.toString("utf8");
        connection.event("control", message);

        // Respond to heartbeat signals
        if (message == "_heartbeat_") {
            protocol.heartbeat();
            break;
        }

        if (typeof protocol.commit === "function")
            protocol.commit(null, message);
        break;
    case 1: // Error
        var error = new NSQProtocolError(payload.toString("utf8"));
        connection.event("error", error);
        if (typeof protocol.commit === "function")
            protocol.commit(error);
        break;
    case 2: // Message
        var message = Message.deserialize(payload);
        message.connection = protocol;
        message.frame_size = size;
        connection.event("message", message);
        break;
    default:
        connection.event("error", new NSQProtocolError("E_UNKNOWN", {
            type : type,
            payload : payload
        }));
    }

    // Pass the rest of the received data to a new framer
    if (data.length - 4 - size > 0)
        framer.call(protocol, data.slice(size + 4));
}

/*******************************************************************************
 * Enqueue NSQ requests
 ******************************************************************************/
Protocol.prototype.publish = function(message, callback) {
    this.messages.buffer({
        blocking : true,
        message : message,
        data : message.serialize()
    }, callback);
};

Protocol.prototype.identify = function(options) {
    var body = JSON.stringify(options);
    var length = 13 + Buffer.byteLength(body);

    // IDENTIFY Frame
    var data = new Buffer(length);
    var offset = data.write("IDENTIFY\n", 'utf8');
    data.writeUInt32BE(Buffer.byteLength(body), offset);
    data.write(body, offset + 9);

    this.messages.buffer({
        blocking : true,
        data : data
    }, callback);
};

Protocol.prototype.subscribe = function(topic, channel, callback) {
    var protocol = this;
    if (this.subscribed)
        throw NSQProtocolError("E_STATE", {
            action : "subscribe",
            message : "Protocol instance is already subscribed!"
        });

    if (!Policy.validTopic(topic))
        throw NSQProtocolError("E_BAD_TOPIC");

    if (!Policy.validChannel(channel))
        throw NSQProtocolError("E_BAD_CHANNEL");

    this.messages.buffer({
        blocking : true,
        message : "SUB " + topic + " " + channel,
        data : new Buffer("SUB " + topic + " " + channel + "\n")
    }, function(err, status) {
        if (!err && Policy.isOK(status))
            protocol.subscribed = true;

        _callback(callback)(err, status);
    });
};

Protocol.prototype.noop = function(callback) {
    this.messages.buffer({
        message : "NOP",
        data : new Buffer("NOP\n")
    }, callback);
};

// Default heartbeat response
Protocol.prototype.heartbeat = Protocol.prototype.noop;

Protocol.prototype.ready = function(count, callback) {
    if (!+count || count < 1 || count > 2500)
        throw RangeError("Ready count must be between 1 and 2500, inclusive");

    this.messages.buffer({
        message : "RDY " + count,
        data : new Buffer("RDY " + count + "\n")
    }, callback);
};

Protocol.prototype.touch = function(id, callback) {
    this.messages.buffer({
        message : "TOUCH " + id,
        data : new Buffer("TOUCH " + id + "\n")
    }, callback);
};

Protocol.prototype.requeue = function(id, callback) {
    this.messages.buffer({
        message : "REQ " + id,
        data : new Buffer("REQ " + id + "\n")
    }, callback);
};

Protocol.prototype.finish = function(id, callback) {
    this.messages.buffer({
        message : "FIN " + id,
        data : new Buffer("FIN " + id + "\n")
    }, callback);
};

/**
 * Enqueue a synthetic message as a barrier event
 */
Protocol.prototype.flush = function(callback) {
    this.messages.buffer({
        flush : true
    }, callback);
};

Protocol.prototype.close = function(callback) {
    var protocol = this;
    var connection = this.connection;

    // Not subscribed. Nothing to close. Just drain the queue
    if (!this.subscribed) {
        this.flush(function() {
            protocol.messages.pause(); // Don't send more commands
            connection.event("close");

            _callback(callback)(null, false);
        });
        return;
    }

    // Flush queued messages first
    this.messages.buffer({
        blocking : true,
        message : "CLOSE",
        data : new Buffer("CLS\n")
    }, function(err, status) {
        if (!err && Policy.isClosed(status)) {
            protocol.messages.pause(); // Don't send more commands
            connection.event("close");
        }
        _callback(callback)(err, status);
    });
};
