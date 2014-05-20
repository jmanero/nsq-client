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
var UUID = require("node-uuid");

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

    this.identity = UUID.v4();
    this.subscriber = null;
    this.client = client;
    this.protocol = new Protocol(this);
    this.protocol.connect();
};
Util.inherits(Connection, EventEmitter);

/**
 * Wrap events with optional debugging
 */
Connection.prototype.event = function() {
    this.emit.apply(this, arguments);
    if (this.client.debug) this.emit("debug", Array.apply(null, arguments));
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
        channel += "#ephemeral";

    return (this.subscriber = new Subscriber(this, topic, channel));
};

Connection.prototype.publish = function(topic, messages, callback) {
    var protocol = this.protocol;

    // TODO if(messages instanceof Array) protocol.mpub(...)
    messages = (messages instanceof Array) ? messages : [ messages ];
    messages.forEach(function(message) {
        protocol.publish(new Message(topic, message), _callback(callback));
    });
};

Connection.prototype.close = function(callback) {
    if(this.subscriber) return this.subscriber.close(callback);
    this.protocol.disconnect(callback);
};
