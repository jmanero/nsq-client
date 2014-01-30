var EventEmitter = require("events").EventEmitter;
var Util = require("util");

var Subscriber = module.exports = function(connection, topic, channel) {
    EventEmitter.call(this);
    var subscriber = this;

    this.paused = false;
    this.chunk = 32;
    this.remaining = 0;
    this.protocol = connection.protocol;
    this.topic = topic;
    this.channel = channel;

    connection.on("error", function(error) {
        subscriber.emit("error", error);
    });
    connection.on("message", function(message) {
        message.topic = subscriber.topic;
        message.channel = subscriber.channel;

        subscriber.emit("message", message);
        subscriber.remaining--;
        subscriber.ready()
    });
    // Debugging
    connection.on("event", function() {
        args = Array.apply(null, arguments);
        args.unshift("event", "connection");
        EventEmitter.prototype.emit.apply(subscriber, args);
    });
    
    this.protocol.on("reconnected", this.subscribe.bind(this));
    this.subscribe();
};
Util.inherits(Subscriber, EventEmitter);

Subscriber.prototype.subscribe = function() {
    var subscriber = this;
    this.protocol.subscribe(this.topic, this.channel, function(err) {
        if (err)
            return subscriber.emit("error", err)

        subscriber.emit("subscribed")
        subscriber.emit("event", "subscribed")
        subscriber.ready(true);
    });
};

Subscriber.prototype.ready = function(force) {
    var subscriber = this;
    if ((force || this.remaining < 1) && !this.paused) {
        this.protocol.ready(subscriber.chunk, function() {
            subscriber.remaining = subscriber.chunk;
        });
    }
}

Subscriber.prototype.pause = function() {
    this.paused = true;
};

Subscriber.prototype.resume = function() {
    if (!this.paused)
        return;
    this.paused = false;
    this.ready();
};
