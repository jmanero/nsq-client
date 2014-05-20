var EventEmitter = require("events").EventEmitter;
var NSQProtocolError = require("./protocol").NSQProtocolError;
var Util = require("util");

var Subscriber = module.exports = function(connection, topic, channel) {
    EventEmitter.call(this);
    var subscriber = this;

    this.paused = false;
    this.chunk = 32;
    this.remaining = 0;
    this.connection = connection;
    this.protocol = connection.protocol;
    this.topic = topic;
    this.channel = channel;

    // Pipe up errors from the underlying connection
    connection.on("error", function(error) {
        // Don't crash out if nothing is consuming the subscriber's errors
        if(subscriber.listeners("error").length) subscriber.emit("error", error);
    });
    connection.on("payloadError", function(error) {
        subscriber.emit("payloadError", error);
    });

    // Handle incoming messages
    connection.on("message", function(message) {
        message.topic = subscriber.topic;
        message.channel = subscriber.channel;

        subscriber.emit("message", message);
        subscriber.remaining--;
        subscriber.ready();
    });

    // Handle (dis)connection
    connection.on("close", function() {
        subscriber.remaining = 0;
    });
    connection.on("connect", function() {
      subscriber.protocol.subscribe(subscriber.topic, subscriber.channel, function(err, status) {
          if (err) return subscriber.emit("error", err);
          if (!status) return subscriber.emit("error", new NSQProtocolError(E_REQ_FAILED));

          subscriber.emit("subscribed");
          subscriber.ready(true);
      });
    });
};
Util.inherits(Subscriber, EventEmitter);

/**
 * Manage the ready-state of the subscription
 */
Subscriber.prototype.ready = function() {
    var subscriber = this;
    if (this.remaining < 1 && !this.paused) {
        this.protocol.ready(subscriber.chunk, function() {
            subscriber.remaining = subscriber.chunk;
        });
    }
};

/**
 * Stop asking for more work. `nsqd` will continue to
 * send us messages until the ready-state reaches 0
 */
Subscriber.prototype.pause = function() {
    this.paused = true;
};

/**
 * Ask for more work again
 */
Subscriber.prototype.resume = function() {
    if (!this.paused)
        return;
    this.paused = false;
    this.ready();
};

/**
 * Try to shutdown the subscription cleanly
 */
Subscriber.prototype.close = function(callback) {
    var protocol = this.protocol;
    protocol.close(function(err, status) {
      // TODO Handle invalid state?
      protocol.disconnect(callback);
    });
};
