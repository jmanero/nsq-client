/*******************************************************************************
 * NSQ Connection
 ******************************************************************************/

// Safe-ish callbacks
function nothing() {}
function _callback(something) {
    return (typeof something === "function") ? something : nothing;
}

var EventEmitter = require("events").EventEmitter;
var Util = require("util");

var Message = require("./message");
var Policy = require("./connection/policy");
var Protocol = require("./connection/protocol");
var Subscriber = require("./connection/subscriber");

/**
 * An NSQ protocol instance and TCP socket
 * 
 * @param client
 */
var Connection = module.exports = function(client) {
    EventEmitter.call(this);
    var connection = this;
    this.client = client;
    
    var protocol = this.protocol = new Protocol(this);
    this.protocol.connect();
};
Util.inherits(Connection, EventEmitter);

/**
 * Wrap events with optional debugging
 */
Connection.prototype.event = function() {
    this.emit.apply(this, arguments);

    if (this.client.debug) {
        var parameters = Array.apply(null, arguments);
        parameters.unshift("event");
        this.emit.apply(this, parameters)
    }
};

/**
 * Instantiate a subscriber instance and subscribe this connection to a
 * topic/channel
 * 
 * @param topic
 * @param channel
 * @param options
 */
Connection.prototype.subscribe = function(topic, channel, options) {
    options = options || {};

    // Ephemeral Channel?
    if (options.ephemeral && !Policy.isEphemeral(channel))
        channel += "#ephemeral"

    return new Subscriber(this, topic, channel);
};

Connection.prototype.publish = function(topic, message, callback) {
    this.protocol.publish(new Message(topic, message), _callback(callback));
};

Connection.prototype.close = function(callback) {
    var connection = this;
    this.protocol.close(function() {
        _callback(callback)();
    });
};
