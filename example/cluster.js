var Cluster = require('../lib/cluster');
var Message = require('../lib/message');

var config = require('./conf').lookupd;
var Util = require('util');

var cluster = new Cluster("172.16.13.216", 4161);
var topic = cluster.connect("foo");
topic.on('error', function(err) {
	Util.log(Util.inspect(err, true, null) + "\n" + err.stack);
	
});

topic.on('message', function(message) {
	console.log(Util.inspect(message, false, null));
	topic.ready(1);
	message.finish();
});

topic.subscribe("bar#ephemeral", function() {
	console.log("Subscribed");
});

setInterval(function() {
	console.log("Publishing message");
	topic.ready(1);
	topic.publish(new Message({ hi : "There"}));
}, 1000);
