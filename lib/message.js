var Int64 = require("int64-native");
var Util = require("util");
var Message = module.exports = function(topic, data) {
    this.id = null;
    this.attempts = 0;
    this.data = data || {};
    this.topic = topic;
};

/*******************************************************************************
 * Accessibility Helpers
 ******************************************************************************/

Message.prototype.finish = function(callback) {
    if (!this.connection)
        throw ReferenceError("No connection available");

    this.connection.finish(this.id, callback);
};

Message.prototype.touch = function(callback) {
    if (!this.connection)
        throw ReferenceError("No connection available");

    this.connection.touch(this.id, callback);
};

Message.prototype.requeue = function(callback) {
    if (!this.connection)
        throw ReferenceError("No connection available");

    this.connection.requeue(this.id, callback);
};

Message.prototype.toString = function() {
    return "<Message:" + this.id + " " + this.topic + " " + JSON.stringify(this.data) + ">";
};

/*******************************************************************************
 * Codec Methods
 * 
 * TODO: Allow for user-defined codecs
 ******************************************************************************/
Message.prototype.serialize = function() {
    var body = JSON.stringify(this.data);
    var length = 4 + this.topic.length + 5 + Buffer.byteLength(body);

    // PUB Frame
    var data = new Buffer(length);
    var offset = data.write("PUB " + this.topic + "\n", "utf8");
    data.writeUInt32BE(Buffer.byteLength(body), offset);
    data.write(body, offset + 4);

    return data;
};

Message.deserialize = function(data) {
    var time = new Int64(data.readUInt32BE(0), data.readUInt32BE(4)); // Nanoseconds
    var attempts = data.readUInt16BE(8); // 2 Bytes (8, 9)

    // toString needs the exclusive upper bound...
    var id = data.toString("ascii", 10, 26); // 16 Bytes (10, 26]

    // but the lower bound is inclusive >.< !?*~...
    var body = JSON.parse(data.toString("utf8", 26) || "{}"); // (26, ..]

    var message = new Message(null, body);
    message.epoch = time.toUnsignedDecimalString();
    message.timestamp = new Date(message.epoch / 1000000);
    message.id = id;
    message.attempts = attempts;

    return message;
};
