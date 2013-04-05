var EventEmitter = require('events').EventEmitter;
var NSQ = require('./connection');
var Queue = require('qrly');
var Request = require('simple-request');
var Topic = require('./topic');
var Util = require('util');

var client = new Request();

var Cluster = module.exports = function(host, port) {
	EventEmitter.call(this);
	this.hostname = host;
	this.port = port;

	this.nodes = [];

};
Util.inherits(Cluster, EventEmitter);

function each(tasks, handler, done) {
	var q = new Queue({
		flushable : true,
		collect : false,
		concurrency : 32
	});
	q.worker = handler;

	if (typeof done === 'function')
		q.on('flushed', done);

	q.push(tasks);
}

Cluster.prototype.connect = function(t, options) {
	if (typeof options === 'function') {
		callback = options;
		options = {};
	} else {
		options = options || {};
	}

	var topic = new Topic(t);
	console.log("Querying lookupd: " + this.hostname + ":" + this.port);

	client.request({
		hostname : this.hostname,
		port : this.port,
		path : "/nodes"
	}, null, (function(err, res) {
		if (err) {
			console.log("Error querying lookupd");
			this.emit('error', err);
			return;
		}

		if (!res || !res.data || !res.data.producers || !res.data.producers.length) {
			this.emit('error', new Error("Unable to retrieve nodes from lookupd: " + Util.inspect(res)));
			return;
		}

		each(res.data.producers, function(p, done) {
			console.log("Adding node " + p.hostname);
			var node = NSQ.connect(p.hostname, p.tcp_port);
			topic.nodes.push(node);
			node.pipe(topic);

			node.on('message', function(message, meta) {
				topic.mutex(message, function(err, safe) {
					if(err) {
						message.requeue();
						return;
					}
					
					if (!safe) { // Eat the message. Someone else already handled it.
						message.finish();
						return;
					}

					topic.emit('message', message, meta);
				});
			});

			if (topic.subscribed) {
				console.log("Subscribing node " + p.hostname + " to " + topic.name + ":" + topic.channel);
				node.subscribe(topic.name, topic.channel, done);

			} else {
				done();

			}
		}, function() {
			topic.messages.resume();
		});

	}).bind(this));

	return topic;
};
