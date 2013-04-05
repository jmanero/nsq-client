var NSQ = require('../index').Connection;

var config = require('./conf').nsqd;
var Util = require('util');

var nsq = NSQ.connect(config.host, config.port);
nsq.on('response', function(data, meta) {
	Util.log("CONTROL: " + data + " (size: " + meta.size + ", type : " + meta.type + ")");
});

nsq.on('error', function(e, meta) {
	Util.log("ERROR:    " + e.code + " (size: " + meta.size + ", type : " + meta.type + ")");
});

nsq.on('message', function(message, meta) {
	Util.log("MESSAGE:  " + Util.inspect(message) + " (size: " + meta.size + ", type : " + meta.type + ")");
	nsq.finish(message.id);
	nsq.ready(4);
});

nsq.subscribe("foo", "bar");
nsq.ready(1);

process.on('SIGINT', function() {
	nsq.close(function() {
		process.exit();
	});
});
