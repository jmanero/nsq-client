var EventEmitter = require('events').EventEmitter;
var Net = require('net');
var Util = require('util');

var Policy = require('./util/policy');
var Protocol = require('./connection/protocol');

// Endpoints
var Consumer = require('./connection/consumer');

/**
 * Container for protocol handler. Provides factories for Consumer and Producer
 * entities for the internal socket. Use Connection.connect(host, port) to
 * initialize connections.
 * 
 * @param socket
 *            a Net.Socket object
 */
var Connection = module.exports = function(socket) {
	EventEmitter.call(this);
	var self = this;
	
	this.protocol = new Protocol(socket);
	this.protocol.on('error', function(err) {
		self.emit('error', err);
	});

};
Util.inherits(Connection, EventEmitter);

/**
 * Connection factory
 * 
 * @param host
 *            Hostname or IP address string of nsqd instance
 * @param port
 *            TCP port, default 4150
 */
Connection.connect = function(host, port) {
	port = port || 4150;

	var socket = Net.connect({
		host : host,
		port : port
	});
	var connection = new Connection(socket);
	connection.identity = host + ":" + port;

	return connection;
};

/**
 * Generate a consumer endpoint for the given topic and channel
 * 
 * @param topic
 * @param channel
 * @param callback
 */
Connection.prototype.subscribe = function(topic, channel, callback) {
	if (!Policy.validateTopic(topic)) {
		var e = new Error("Invalid topic " + topic);
		e.code = "E_INPUT";
		throw e;
	}

	if (!Policy.validateChannel(channel)) {
		var e = new Error("Invalid channel " + channel);
		e.code = "E_INPUT";
		throw e;
	}

	var self = this;
	this.protocol.subscribe(topic, channel, function(err) {
		if (err) {
			callback(err);
			return;
		}

		callback(null, new Consumer(self, topic, channel));
	});
};

Connection.prototype.publish = function(message, topic, callback) {
	this.protocol.publish(message, topic, callback);
};

Connection.prototype.close = function(callback) {
	this.messages.buffer(new Buffer("CLS\n"), callback);
};
