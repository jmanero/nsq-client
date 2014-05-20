/*******************************************************************************
 * NSQ Protocol Frame and Transaction Semantics
 ******************************************************************************/

// Safe-ish callbacks
function nothing() {}
function _callback(something) {
    return (typeof something === "function") ? something : nothing;
}

var Net = require("net");
var Queue = require("qrly");
var Util = require("util");

var Message = require("../message");
var Policy = require("./policy");

/**
 * NSQ Protocol Error
 */
var NSQProtocolError = function(code, params) {
    Error.call(this);
    params = params || {};

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
    E_SUB_FAILED : "Subscrition failed",
    E_TOUCH_FAILED : "Touch failed",
    E_TIMEOUT : "No response received from the server",
    E_UNKNOWN_TYPE : "Received unknown NSQ frame type",
    E_UNKNOWN_CODE : "Received unknown NSQ response code",
    E_STATE : "Protocol instance is in an invalid state"
};

/**
 * NSQ Protocol Handler
 */
var Protocol = module.exports = function(connection) {
    var protocol = this;

    this.connection = connection;
    this.connected = false;
    this.timeout = connection.client.timeout; // transaction timeout
    this.reconnect = connection.client.reconnect; // Reconnect interval

    // Outgoing message buffer
    this.messages = new Queue({
        concurrency : 1,
        paused : true,
        flushable : false,
        collect : false
    });

    // Send Messages
    this.messages.worker = function(operation, done) {
        // Synthetic message. Nothing to send
        if (operation.flush) {
            connection.event("flush");
            return done();
        }

        // Debugging
        if (connection.client.debug && operation.data) {
            operation.message = operation.data.toString("utf8");
            connection.event("send", operation);
        }

        protocol.socket.write(operation.data, function() {
            if (operation.blocking) { // Start Transaction
                protocol.commit = function(err, status) { // Commit handle
                    clearTimeout(timeout); // Clear transaction timeout
                    delete protocol.commit; // Clear commit handle

                    if (err) connection.event("error", err);
                    done(err, status); // Release the queue on completion or timeout
                };

                // Set transaction timeout
                var timeout = setTimeout(function() {
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
    var connection = this.connection;
    var socket = this.socket = new Net.Socket();

    // Handle new socket"s events
    socket.on("error", function onError(err) {
        connection.event("error", err);
    });

    // (Re)Start the sending state-machine
    socket.on("connect", function() {
        protocol.connected = true;
        connection.event("connect");

        socket.write(Policy.VERSION); // Send MAGIC header
        protocol.messages.resume(); // Start sending queued messages
    });

    // Parse incoming frames
    socket.on("data", framer.bind(this));

    // Handle disconnects
    socket.on("close", function() {
        protocol.connected = false;
        protocol.messages.pause();

        protocol.messages.pause();
        delete protocol.socket;

        // Try to reconnect
        if (+(protocol.reconnect)) {
            protocol._reconnect = setTimeout(function() {
                protocol.connect();
            }, protocol.reconnect);
            return;
        }

        connection.event("close");
    });

    // Let other things continue to set up before connecting
    setImmediate(function() {
      socket.connect(connection.client);
    });
};

/**
 * Shutdown the state-machine and then the TCP socket
 */
Protocol.prototype.disconnect = function(callback) {
    // Stop trying to reconnect
    clearTimeout(this._reconnect);
    this.reconnect = false;
    if (!this.socket) return callback(); // No Socket. Done.

    var protocol = this;
    if (!protocol.messages.paused)
        return this.flush(function(err) {
            protocol.messages.pause();
            protocol.socket.end();
            _callback(callback)(err);
        });

    // Already paused
    protocol.socket.end();
    _callback(callback)();
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

    var message;
    switch (type) {
    case 0: // Response/Control
        message = payload.toString("utf8");
        connection.event("control", message);

        // Respond to heartbeat signals
        if (message == "_heartbeat_") {
            protocol.heartbeat();
            break;
        }

        // Close transactions
        if (typeof protocol.commit === "function")
            protocol.commit(null, message);
        break;
    case 1: // Error
        var err = new NSQProtocolError(payload.toString("utf8"));
        connection.event("error", err);

        // Close transactions
        if (typeof protocol.commit === "function")
            protocol.commit(err);
        break;
    case 2: // Message
        try {
            message = Message.deserialize(payload);
            message.connection = protocol;
            message.frame_size = size;
            connection.event("message", message);
        /* jshint -W002 */
        } catch (err) {
            connection.event("payloadError", new NSQProtocolError("E_BAD_MESSAGE", err));
        }
        /* jshint +W002 */
        break;
    default:
        connection.event("error", new NSQProtocolError("E_UNKNOWN_TYPE", {
            type : type,
            payload : payload
        }));
    }

    // Pass the rest of the received data back to the framer
    if (data.length - 4 - size > 0)
        framer.call(protocol, data.slice(size + 4));
}

/*******************************************************************************
 * Enqueue NSQ requests
 ******************************************************************************/

/**
 * Enqueue a synthetic message as a barrier event
 */
Protocol.prototype.flush = function(callback) {
    this.messages.buffer({
        flush : true
    }, callback);
};

Protocol.prototype.publish = function(message, callback) {
    this.messages.buffer({
        blocking : true,
        data : message.serialize()
    }, callback);
};

Protocol.prototype.identify = function(options) {
    var body = JSON.stringify(options);
    var length = 13 + Buffer.byteLength(body);

    // IDENTIFY Frame
    var data = new Buffer(length);
    var offset = data.write("IDENTIFY\n", "utf8");
    data.writeUInt32BE(Buffer.byteLength(body), offset);
    data.write(body, offset + 9);

    this.messages.buffer({
        blocking : true,
        data : data
    }, callback);
};

Protocol.prototype.subscribe = function(topic, channel, callback) {
    // Validation
    if (!Policy.validTopic(topic))
        throw NSQProtocolError("E_BAD_TOPIC");

    if (!Policy.validChannel(channel))
        throw NSQProtocolError("E_BAD_CHANNEL");

    this.messages.buffer({
        blocking : true,
        data : new Buffer("SUB " + topic + " " + channel + "\n")
    }, callback);
};

Protocol.prototype.noop = function(callback) {
    this.messages.buffer({
        data : new Buffer("NOP\n")
    }, callback);
};

// Default heartbeat response
Protocol.prototype.heartbeat = Protocol.prototype.noop;

Protocol.prototype.ready = function(count, callback) {
    /* jshint -W018 */
    if (!+count || count < 1 || count > 2500)
        throw RangeError("Ready count must be between 1 and 2500, inclusive");
    /* jshint +W018 */

    this.messages.buffer({
        data : new Buffer("RDY " + count + "\n")
    }, callback);
};

Protocol.prototype.touch = function(id, callback) {
    this.messages.buffer({
        data : new Buffer("TOUCH " + id + "\n")
    }, callback);
};

Protocol.prototype.requeue = function(id, callback) {
    this.messages.buffer({
        data : new Buffer("REQ " + id + "\n")
    }, callback);
};

Protocol.prototype.finish = function(id, callback) {
    this.messages.buffer({
        data : new Buffer("FIN " + id + "\n")
    }, callback);
};

Protocol.prototype.close = function(callback) {
    this.messages.buffer({
        blocking : true,
        data : new Buffer("CLS\n")
    }, callback);
};
