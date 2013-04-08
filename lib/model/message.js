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
	if (!this.socket) {
		callback(new TypeError("No connection available"));
		return;
	}

	this.socket.finish(this.id, callback);
};

Message.prototype.touch = function(callback) {
	if (!this.socket) {
		callback(new TypeError("No connection available"));
		return;
	}

	this.socket.touch(this.id, callback);
};

Message.prototype.requeue = function(callback) {
	if (!this.socket) {
		callback(new TypeError("No connection available"));
		return;
	}

	this.socket.requeue(this.id, callback);
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
	// There's something wonky with the date bytes in the currently
	// implemented protocol. It seems that the following resolves
	// to seconds since 1/1/1970... Just go with it.
	var time = msg.readUInt32BE(4);
	
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
	message.timestamp = new Date(time * 1000);
	message.id = id;
	message.attempts = attempts;

	callback(null, message);
};
