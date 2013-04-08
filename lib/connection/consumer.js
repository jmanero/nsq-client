var EventEmitter = require('events').EventEmitter;
var Util = require('util');

var Consumer = module.exports = function(connection, topic, channel) {
	EventEmitter.call(this);
	var self = this;

	this.paused = false;
	this.throtle = 8;
	this.connection = connection;
	this.protocol = connection.protocol;
	this.topic = topic;
	this.channel = channel;

	this.ready = this.throtle;

	this.protocol.on('message', function(message, meta) {
		message.topic = self.topic;
		message.channel = self.channel;
		
		self.emit('message', message, meta);
		self.ready--;

		if (!self.ready && !this.paused) {
			ready.call(self);
		}
	});
	
	ready.call(this);
};
Util.inherits(Consumer, EventEmitter);

Consumer.prototype.setThrotle = function(value) {
	if (!+value)
		throw TypeError(value + " is not a number");

	this.throtle = +value;
};

function ready() {
	var self = this;
	this.protocol.ready(this.throtle, function(err) {
		if (err) {
			self.emit('error', err);
			return;
		}

		self.ready = self.throtle;
	});
};

Consumer.prototype.pause = function() {
	this.paused = true;
};

Consumer.prototype.resume = function() {
	if (!this.paused)
		return;

	var self = this;

	this.paused = false;
	ready.call(this);
};
