var Util = require('util');

var Message = module.exports = function(data, topic) {
	this.id = null;
	this.attempts = 0;
	this.data = data || {};
	this.topic = topic;
};

/*******************************************************************************
 * Accessibility Helpers
 ******************************************************************************/

Message.prototype.finish = function(callback) {
	if (!this.client) {
		callback(new TypeError("No connection available"));
		return;
	}

	this.client.finish(this.id, callback);
};

Message.prototype.touch = function(callback) {
	if (!this.client) {
		callback(new TypeError("No connection available"));
		return;
	}

	this.client.touch(this.id, callback);
};

Message.prototype.requeue = function(callback) {
	if (!this.client) {
		callback(new TypeError("No connection available"));
		return;
	}

	this.client.requeue(this.id, callback);
};

/*******************************************************************************
 * Codec Methods TODO: Allow for user-defined codecs
 ******************************************************************************/
Message.prototype.serialize = function(callback) {
	var body = {};
	body.length = 0;

	try {
		body = JSON.stringify(this.data);

	} catch (e) {
		callback(e);
		return;

	}

	var length = 4 + this.topic.length + 5 + body.length;
	var data = new Buffer(length);
	var offset = data.write("PUB " + this.topic + "\n", 'utf8');
	data.writeUInt32BE(body.length, offset);
	data.write(body, offset + 4);

	callback(null, data);
};

Message.deserialize = function(msg, callback) {
	var time = msg.readUInt32BE(0); // Top half of time stamp (0, 3) of (0, 7)
	var attempts = msg.readUInt16BE(8); // 2 Bytes (8, 9)

	// toSting needs the exclusive upper bound...
	var id = msg.toString('utf8', 10, 26); // 16 Bytes (10, 26]
	// but the lower bound is inclusive.
	var data = msg.toString('utf8', 26) || "{}"; // (26, ..]

	var body = {};
	try {
		body = JSON.parse(data);

	} catch (e) {
		callback(e);
		return;
	}

	var message = new Message(body);

	/*
	 * We need to left-shift the first 32 bits of the time stamp an additional
	 * 32 bits, e.g. to the top-half of the UInt64. Then divide by 100000 to
	 * convert from nanoseconds to milliseconds:
	 * 
	 * Proof: 1. (n << 32) / 100000 === (n * Math.pow(2, 32)) / 100000 2. (n *
	 * Math.pow(2, 32)) / 100000 === n * (Math.pow(2, 32) / 100000) 2. n *
	 * (Math.pow(2, 32) / 100000) === n * 4294.967296
	 * 
	 * I've not included the next 16 bits because they evaluate to 0.65536
	 * milliseconds of precision...
	 */
	message.timestamp = new Date(time * 4294.967296);

	message.id = id;
	message.attempts = attempts;

	callback(null, message);
};
