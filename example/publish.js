var NSQ = require('../index').Connection;
var Message = require('../lib/message');

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
	nsq.ready(1);
});

nsq.subscribe('foo', 'bar#ephemeral');
nsq.ready(1);

setInterval(function() {
	nsq.publish(new Message({ arm : "elbow"}, "foo"));
}, 1000);
