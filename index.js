/*******************************************************************************
 * NSQ CLient (Non-Clustered)
 ******************************************************************************/

// Add pipe helper to EventEmitter
var EventEmitter = require("events").EventEmitter;
var Util = require("util");
var URL = require("url");

// Safe-ish callbacks
function nothing() {}
function _callback(something) {
    return (typeof something === "function") ? something : nothing;
}

// Iterates *DESTRUCTIVLY* through an array of asynchronous tasks (Serially)
// HINT pass `<array>.concat([])` as `tasks`
function loopy(tasks, handler, complete) {
    if (tasks.length == 0)
        return complete();

    handler(tasks.shift(), function(err) {
        if (err)
            return complete(err);
        loopy(tasks, handler, complete);
    });
}

/**
 * A collection of subscriber connections and a publisher connection to a single
 * instance of nsqd
 * 
 * @param options
 *            <ul>
 *            <li>A string formatted as a URL: nsq://hostname:port</li>
 *            <li>A hash containing keys `hostname` and `port`</li>
 *            </ul>
 */
var Client = module.exports = function(options) {
    EventEmitter.call(this);
    options = options || {}
    if (typeof options === "string")
        options = URL.parse(options)

    this.host = options.hostname || "localhost"
    this.port = +(options.port) || 4150

    this._connections = [];
};
Util.inherits(Client, EventEmitter);

var Connection = Client.Connection = require("./lib/connection");
Client.Message = require("./lib/message");

/**
 * Create a new connection
 */
Client.prototype.connection = function(ident) {
    var client = this;
    var connection = new Connection(this);
    connection._identity = ident || "";

    this._connections.push(connection); // Store connections for clean close
    return connection;
};

Client.prototype.publisher = function() {
    if (!this._publisher) // Start the publisher connection
        this._publisher = this.connection("publisher");

    return this._publisher;
};

/**
 * Create a subscriber connection for specified topic/channel
 * 
 * @param topic
 * @param channel
 * @param options
 * 
 * @returns Subscriber
 */
Client.prototype.subscribe = function(topic, channel, options) {
    return this.connection(topic + "/" + channel).subscribe(topic, channel, options);
};

/**
 * Publish a message to channel
 * 
 * @param topic
 * @param message
 * @param callback
 */
Client.prototype.publish = function(topic, message, callback) {
    this.publisher().publish(topic, message, _callback(callback));
};

/**
 * Close all open connections
 * 
 * @param callback
 */
Client.prototype.close = function(callback) {
    loopy(this._connections, function(connection, closed) {
        connection.close(closed);
    }, _callback(callback));
};
