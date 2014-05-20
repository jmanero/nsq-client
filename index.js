/*******************************************************************************
 * NSQ CLient (Non-Clustered)
 ******************************************************************************/

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
  if (tasks.length === 0)
    return complete();

  handler(tasks.shift(), function(err) {
    if (err) return complete(err);
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
  options = options || {};
  if (typeof options === "string") options = URL.parse(options);

  this.debug = !! options.debug; // Noisy Events
  this.host = options.hostname || "localhost";
  this.port = +(options.port) || 4150;
  this.reconnect = (typeof options.reconnect === "undefined") ? 2500 : options.reconnect;
  this.timeout = (typeof options.timeout === "undefined") ? 1000 : options.timeout;

  // Track connection objects
  this._connections = {};
};
Util.inherits(Client, EventEmitter);

var Connection = Client.Connection = require("./lib/connection");
Client.Lookupd = require("./lib/lookupd");
Client.Message = require("./lib/message");

/**
 * Create a new connection
 */
Client.prototype.connection = function() {
  var client = this;
  var connection = new Connection(this);

  if (this.debug) {
    connection.on("debug", function(event) {
      event.unshift(connection.identity);
      client.emit("debug", event);
    });
  }

  this._connections[connection.identity] = connection; // Store connections for clean close
  connection.once("close", function() { // Cleanup connection pool ref
    delete client._connections[connection.identity];
  });

  return connection;
};

Client.prototype.publisher = function() {
  // Start the publisher connection
  if (!this._publisher) this._publisher = this.connection();
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
  return this.connection().subscribe(topic, channel, options);
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
  var client = this;
  loopy(Object.keys(this._connections), function(identity, closed) {
    client._connections[identity].close(closed);
  }, _callback(callback));
};
