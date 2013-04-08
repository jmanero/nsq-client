var EventEmitter = require('events').EventEmitter;
var Net = require('net');
var Queue = require('qrly');
var Util = require('util');

var Message = require('../model/message');

/*******************************************************************************
 * NOOP method
 ******************************************************************************/
function gimp() {
}

/*******************************************************************************
 * State container for transactions
 ******************************************************************************/
var Stater = function() {
	this.state = "IDLE";
	this.period = 45;

	this.timeoutHandle = 0;
	this.callback = gimp;
};

Stater.prototype.wait = function(callback) {
	this.state = "WAIT";
	this.timeoutHandle = setTimeout((function() {
		this.successHandle = gimp;

		var e = new Error("Timeout waiting for response message");
		e.code = "E_TIMEOUT";

		callback(e);
	}).bind(this), this.period);

	this.callback = callback;
};

Stater.prototype.waiting = function() {
	return this.state === "WAIT";
};

Stater.prototype.complete = function(error, message) {
	var callback = this.callback;
	process.nextTick(function() {
		
		// Pass error or message back up to the right callback
		callback(error, message);
	});

	this.callback = gimp;
	this.state = "IDLE";
};

/*******************************************************************************
 * NSQ Protocol Message and Transaction Semantics
 ******************************************************************************/
var Protocol = module.exports = function(socket) {
	EventEmitter.call(this);
	var self = this;

	this.socket = socket;
	this.stater = new Stater();

	this.messages = new Queue({
		concurrency : 1,
		paused : true,
		flushable : false,
		collect : false
	});
	this.messages.worker = function(message, next) {
		socket.write(message, function() {
			self.stater.wait(next);
		});
	};

	// Recursively parse packet data into frames. Surface frames by type.
	function framer(data) {
		var size = data.readUInt32BE(0);
		var type = data.readUInt32BE(4);

		var payload = data.slice(8, 4 + size);

		switch (type) {
		case 0: // Response/Control
			var res = payload.toString('utf8');

			// Automatically respond to heartbeat signals
			if (res == "_heartbeat_") {
				self.noop();
				break;
			}

			if (!self.stater.waiting()) {
				var e = new Error("Unsynchronized response message");
				e.code = "E_SYNC";
				e.response = res;

				self.emit('error', e);
				break;
			}

			self.stater.complete(null, {
				size : size,
				type : type,
				code : res
			});

			break;
		case 1: // Error
			var err = new Error("NSQ error");
			err.code = payload.toString('utf8');

			if (!self.stater.waiting()) {
				var e = new Error("Unsynchronized error message");
				e.code = "E_SYNC";
				e.response = err;

				self.emit('error', e);
				break;
			}

			self.stater.complete({
				size : size,
				type : type,
				error : err
			});

			break;
		case 2: // Message
			Message.deserialize(payload, function(err, message) {
				message.socket = self;

				self.emit('message', message, {
					size : size, // Meta
					type : type
				});
			});
			break;
		default:
			self.emit('error', new RangeError("Unknown NSQ frame type"));
		}

		// Pass the rest of the received data to a new framer
		if (data.length - 4 - size) {
			var next = data.slice(size + 4);
			framer(next);
		}
	}

	socket.on('data', function(data) {
		framer(data);
	});

	socket.on('error', function(err) {
		self.emit('error', err);
	});
};
Util.inherits(Protocol, EventEmitter);

// Constants
var Version = Protocol.VERSION = new Buffer("  V2", 'utf8');

var channelTest = /^[\.a-zA-Z0-9_\-#]{1,31}$/;
function validateChannel(str) {
	return channelTest.test(str);
}

var topicTest = /^[\.a-zA-Z0-9_\-]{1,31}$/;
function validateTopic(str) {
	return topicTest.test(str);
}

Protocol.connect = function(host, port) {
	port = port || 4150;

	var socket = Net.connect({
		host : host,
		port : port
	});
	var proto = new Protocol(socket);

	socket.on('connect', function() {
		socket.write(Version); // MAGIC header
		proto.messages.resume();
	});

	return proto;
};

/*******************************************************************************
 * NSQ Protocol Commands
 ******************************************************************************/
Protocol.prototype.publish = function(message, topic, callback) {

	if (typeof topic === 'function') { // Topic omitted
		callback = topic;
		topic = null;

	} else if (!(message instanceof Message)) {
		message = new Message(message);
	}

	if (topic) {
		message.topic = topic;
	}

	if (!message.topic || !validate(message.topic)) {
		var e = new Error("Invalid topic " + topic);
		e.code = "E_INPUT";

		// If you're too lazy to pass me a callback, then eat it...
		if (typeof callback !== 'function')
			throw e;

		callback(e);
		return;
	}

	message.serialize(function(e, msg) {
		if (e) {
			if (typeof callback !== 'function')
				// The stack here *should* actually be useful and show you where
				// your codec sucks.
				throw e;

			callback(e);
			return;
		}

		this.messages.buffer(msg, callback);
	});
};

Protocol.prototype.subscribe = function(topic, channel, callback) {
	if (!validateTopic(topic)) {
		var e = new Error("Invalid topic " + topic);
		e.code = "E_INPUT";
		if (typeof callback !== 'function')
			throw e;

		callback(e);
		return;
	}

	if (!validate(channel)) {
		var e = new Error("Invalid channel " + channel);
		e.code = "E_INPUT";
		if (typeof callback !== 'function')
			throw e;

		callback(e);
		return;
	}

	this.messages.buffer(new Buffer("SUB " + topic + " " + channel + "\n"), callback);
};

Protocol.prototype.noop = function(callback) {
	this.messages.buffer(new Buffer("NOP\n"), callback);
};

Protocol.prototype.close = function(callback) {
	var self = this;

	this.messages.buffer(new Buffer("CLS\n"), function() {
		self.messages.pause();

		if (typeof callback === 'function')
			callback();
	});
};

Protocol.prototype.ready = function(count, callback) {
	if (!+count || count < 1 || count > 2500) {
		var e = new RangeError("Ready count must be between 1 and 2500, inclusive");
		e.code = "E_INPUT";
		if (typeof callback !== 'function')
			throw e;

		callback(e);
		return;
	}

	this.messages.buffer(new Buffer("RDY " + count + "\n"), callback);
};

Protocol.prototype.touch = function(id, callback) {
	this.messages.buffer(new Buffer("TOUCH " + id + "\n"), callback);
};

Protocol.prototype.requeue = function(id, callback) {
	this.messages.buffer(new Buffer("REQ " + id + "\n"), callback);
};

Protocol.prototype.finish = function(id, callback) {
	this.messages.buffer(new Buffer("FIN " + id + "\n"), callback);
};
