var EventEmitter = require('events').EventEmitter;
var Net = require('net');
var Queue = require('qrly');
var Util = require('util');

var Message = require('../model/message');
var Policy = require('../util/policy');

/*******************************************************************************
 * State container for transactions
 ******************************************************************************/
var Stater = require('../../../stater');

/*******************************************************************************
 * NSQ Protocol Frames and Transaction Semantics
 ******************************************************************************/
var Protocol = module.exports = function(socket) {
	EventEmitter.call(this);
	var self = this;

	this.socket = socket;
	this.fsm = new Stater();

	// Timeouts
	this.atomic_timeout = 1000;
	this.error_window = 80;

	this.fsm.addState("Ready", function(inputs, next) {
		this.set('atomic', inputs.atomic);
		this.set('callback', inputs.callback);

		// Timeout in atomic mode is an error. Non-atomic ops wait for a couple
		// MS for an error, then release the socket... Not ideal (>.<)
		this.set('timeout', setTimeout((function() {
			// FSM will be in Waiting state if this fires

			if (inputs.atomic) {
				var e = new Error("Response timeout");
				e.code = "E_TIMEOUT";

				// Waiting -> Ready
				this.tick({
					error : e
				});

				return;
			}

			// Nothing to see here (not atomic, didn't receive an error)...
			this.tick({}); // Waiting -> Ready
		}).bind(this), inputs.atomic ? self.atomic_timeout : self.error_window));

		next("Waiting");
	});
	this.fsm.addState("Waiting", function(inputs, next) {

		// If this tick isn't triggered by a timeout, don't let it fire later
		var timeout = this.get('timeout');
		if (timeout)
			clearTimeout(timeout);

		// Callback?!
		var callback = this.get('callback');

		this.clear(); // Reset stash to clean state
		next("Ready"); // Put the FSM back into ready state

		if (typeof callback === 'function')
			callback(inputs.error, inputs.response); // Release the queue
	});
	this.fsm.start("Ready");

	this.messages = new Queue({
		concurrency : 1,
		paused : true,
		flushable : false,
		collect : false
	});
	this.messages.worker = function(operation, done) {
		socket.write(operation.message, function() {

			// Ready -> Waiting
			self.fsm.tick({
				expect : "Ready",
				atomic : !!operation.atomic,
				callback : done
			});
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

			if (self.fsm.state() !== "Waiting") {
				var e = new Error("Unsynchronized response frame");
				e.code = "E_SYNC";
				e.state = self.fsm.state();
				e.frame_data = res;

				self.emit('error', e);
				break;
			}

			// Waiting -> Ready
			self.fsm.tick({
				response : res
			});

			break;
		case 1: // Error
			if (self.fsm.state() !== "Waiting") {
				var e = new Error("Unsynchronized error frame");
				e.code = "E_SYNC";
				e.frame_data = payload.toString('utf8');

				self.emit('error', e);
				break;
			}

			var err = new Error("NSQ error");
			err.code = payload.toString('utf8');

			// Waiting -> Ready
			self.fsm.tick({
				error : err
			});

			break;
		case 2: // Message
			Message.deserialize(payload, function(err, message) {
				Object.defineProperty(message, 'socket', {
					value : self,
					enumerable : false
				});

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

	socket.on('connect', function() {
		socket.write(Policy.VERSION); // MAGIC header
		self.messages.resume();
	});

	socket.on('data', framer);

	socket.on('error', function(err) {
		self.emit('error', err);
	});

	// The socket is gone. Tell something!
	function hangup() {
		self.messages.pause();
		self.emit('hangup');
	}
	socket.on('end', hangup);
	socket.on('close', hangup);
};
Util.inherits(Protocol, EventEmitter);

/*******************************************************************************
 * NSQ Protocol Commands
 ******************************************************************************/
Protocol.prototype.publish = function(message, topic, callback) {
	var self = this;
	if (typeof topic === 'function') { // Topic omitted
		callback = topic;
		topic = null;

	} else if (!(message instanceof Message)) {
		message = new Message(message);
	}

	if (topic) {
		message.topic = topic;
	}

	if (!message.topic || !Policy.validateTopic(message.topic)) {
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

		self.messages.buffer({
			atomic : true,
			message : msg
		}, callback);
	});
};

Protocol.prototype.subscribe = function(topic, channel, callback) {
	if (!Policy.validateTopic(topic)) {
		var e = new Error("Invalid topic " + topic);
		e.code = "E_INPUT";
		if (typeof callback !== 'function')
			throw e;

		callback(e);
		return;
	}

	if (!Policy.validateChannel(channel)) {
		var e = new Error("Invalid channel " + channel);
		e.code = "E_INPUT";
		if (typeof callback !== 'function')
			throw e;

		callback(e);
		return;
	}

	this.messages.buffer({
		atomic : true,
		message : new Buffer("SUB " + topic + " " + channel + "\n")
	}, callback);
};

Protocol.prototype.noop = function(callback) {
	this.messages.buffer({
		message : new Buffer("NOP\n")
	}, callback);
};

Protocol.prototype.close = function(callback) {
	var self = this;

	this.messages.buffer({
		atomic : true,
		message : new Buffer("CLS\n")
	}, function() {
		self.messages.pause();
		self.emit('end');

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

	this.messages.buffer({
		message : new Buffer("RDY " + count + "\n")
	}, callback);
};

Protocol.prototype.touch = function(id, callback) {
	this.messages.buffer({
		message : new Buffer("TOUCH " + id + "\n")
	}, callback);
};

Protocol.prototype.requeue = function(id, callback) {
	this.messages.buffer({
		message : new Buffer("REQ " + id + "\n")
	}, callback);
};

Protocol.prototype.finish = function(id, callback) {
	this.messages.buffer({
		message : new Buffer("FIN " + id + "\n")
	}, callback);
};
