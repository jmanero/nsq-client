var EventEmitter = require('events').EventEmitter;
var Net = require('net');
var Queue = require('qrly');
var Util = require('util');

var Message = require('./message');

var Connection = module.exports = function(socket) {
	EventEmitter.call(this);
	var self = this;

	this.socket = socket;

	this.messages = new Queue({
		paused : true,
		flushable : false,
		collect : false
	});
	this.messages.worker = function(message, callback) {
		socket.write(message, callback);
	};

	// Recursively parse packet data into frames. Surface frames by type.
	function framer(data) {
		var size = data.readUInt32BE(0);
		var type = data.readUInt32BE(4);

		var payload = data.slice(8, 4 + size);

		switch (type) {
		case 0: // Response/Control
			var res = payload.toString('utf8');
			if (res == "_heartbeat_") // Automatically respond to heartbeat signals
				self.noop();

			self.emit('response', res, {
				size : size, // Meta
				type : type
			});
			break;
		case 1: // Error
			var e = new Error("NSQ response error");
			e.code = payload.toString('utf8');
			self.emit('error', e, {
				size : size, // Meta
				type : type
			});
			break;
		case 2: // Message
			var m = Message.deserialize(payload);
			m.client = self;
			
			self.emit('message', m, {
				size : size, // Meta
				type : type
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
Util.inherits(Connection, EventEmitter);

// Constants
var Version = Connection.VERSION = new Buffer("  V2", 'utf8');

var channelTest = /^[\.a-zA-Z0-9_\-#]{1,31}$/;
function validate(str) {
	return channelTest.test(str);
}

Connection.connect = function(host, port) {
	port = port || 4150;

	var socket = Net.connect({
		host : host,
		port : port
	});
	var connection = new Connection(socket);
	connection.identity = host + ":" + port;

	socket.on('connect', function() {
		socket.write(Version); // MAGIC header
		connection.messages.resume();
	});

	return connection;
};

Connection.prototype.pipe = function(parent) {
	this.on('error', function(data, meta) {
		meta = meta || {};
		meta.node = this.identity;
		
		parent.emit('error', data, meta);
	});
	
	this.on('response', function(data, meta) {
		meta.node = this.identity;
		parent.emit('response', data, meta);
	});
};

Connection.prototype.subscribe = function(topic, channel, callback) {
	if (!validate(topic)) {
		callback(new Error("Invalid topic " + topic));
		return;
	}

	if (!validate(channel)) {
		callback(new Error("Invalid channel " + channel));
		return;
	}

	this.messages.buffer(new Buffer("SUB " + topic + " " + channel + "\n"), callback);
};

Connection.prototype.publish = function(message, callback) {
	if (!(message instanceof Message)) {
		callback(new TypeError("Input must be a Message"));
		return;
	}

	this.messages.buffer(message.serialize(), callback);
};

Connection.prototype.noop = function(callback) {
	this.messages.buffer(new Buffer("NOP\n"), callback);
};

Connection.prototype.close = function(callback) {
	var self = this;
	
	this.messages.buffer(new Buffer("CLS\n"), function() {
		self.messages.pause();
		callback();
	});
};

Connection.prototype.ready = function(count, callback) {
	if (!+count || count < 1 || count > 2500) {
		callback(new RangeError("Ready count must be between 1 and 2500, inclusive"));
		return;
	}

	this.messages.buffer(new Buffer("RDY " + count + "\n"), callback);
};

Connection.prototype.touch = function(id, callback) {
	this.messages.buffer(new Buffer("TOUCH " + id + "\n"), callback);
};

Connection.prototype.requeue = function(id, callback) {
	this.messages.buffer(new Buffer("REQ " + id + "\n"), callback);
};

Connection.prototype.finish = function(id, callback) {
	this.messages.buffer(new Buffer("FIN " + id + "\n"), callback);
};
