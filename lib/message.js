var Util = require('util');

var Message = module.exports = function(data, topic) {
	this.id = null;
	this.attempts = 0;
	this.data = data || {};
	this.topic = topic || "unknown";
};

Message.prototype.finish = function() {
	if(!this.client)
		return;
	
	this.client.finish(this.id);
};

Message.prototype.touch = function() {
	if(!this.client)
		return;
	
	this.client.touch(this.id);
};

Message.prototype.requeue = function() {
	if(!this.client)
		return;
	
	this.client.requeue(this.id);
};

Message.prototype.serialize = function() {
	var body = {};
	body.length = 0;

	try {
		body = JSON.stringify(this.data);

	} catch (e) {
		Util.log("Message: Error serializing data: " + e.message);
		Util.puts("-- DATA --------\n" + Util.inspect(this.data));
		return;

	}

	var length = 4 + this.topic.length + 5 + body.length;
	var data = new Buffer(length);
	var offset = data.write("PUB " + this.topic + "\n", 'utf8');
	data.writeUInt32BE(body.length, offset);
	data.write(body, offset + 4);
	
	return data;
};

Message.deserialize = function(msg) {
	// Timestamp -> 8 Bytes (0, 8]
	var attempts = msg.readUInt16BE(8); // 2 Bytes (8, 9)
	var id = msg.toString('utf8', 10, 26); // 16 Bytes (10, 26]
	var data = msg.toString('utf8', 26) || "{}"; // (26, ..]

	var body = {};
	try {
		body = JSON.parse(data);

	} catch (e) {
		Util.log("Message: Error parsing data: " + e.message);
		Util.log("-- Data --------\n" + data);
		return;
	}

	var message = new Message(body, null);
	message.id = id;
	message.attempts = attempts;

	return message;
};