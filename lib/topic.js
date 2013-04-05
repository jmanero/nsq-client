var EventEmitter = require('events').EventEmitter;
var Queue = require('qrly');
var Util = require('util');

var Topic = module.exports = function(name) {
	EventEmitter.call(this);
	var self = this;
	this.nodes = [];

	this.subscribed = false;
	this.name = name;
	
	this.mutex = function(message, cb) {
		cb(true);
	};

	this.messages = new Queue({
		paused : true,
		flushable : false,
		collect : false
	});

	this.messages.worker = function(message, callback) {
		
		each(self.nodes, function(node, done) {
			node.publish(message, done);
		}, callback);
	};
};
Util.inherits(Topic, EventEmitter);

function each(tasks, handler, done) {
	var q = new Queue({
		flushable : true,
		collect : false,
		concurrency : 32
	});
	q.worker = handler;
	
	if(typeof done === 'function') {
		q.on('flushed', done);
	}
	q.push(tasks);
}

Topic.prototype.subscribe = function(channel, callback) {
	if (this.subscribed || !channel)
		return;

	this.subscribed = true;
	this.channel = channel;

	each(this.nodes, function(node, complete) {
		console.log("Subscribing node to " + topic.name + ":" + topic.channel);
		node.subscribe(this.name, channel, complete);
	}, callback);
};

Topic.prototype.ready = function(count, callback) {
	count = count || 1;
	
	each(this.nodes, function(node, done) {
		node.ready(count, done);
	}, callback);
};

Topic.prototype.close = function(callback) {
	each(this.nodes, function(node, done) {
		node.close(done);
	}, callback);
};

Topic.prototype.publish = function(message, callback) {
	message.topic = this.name;
	this.messages.buffer(message, callback);
};
