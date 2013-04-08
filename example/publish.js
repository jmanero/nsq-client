var NSQ = require('../index').Connection;
var Message = require('../lib/model/message');

var config = require('./conf').nsqd;
var Util = require('util');

var nsq = NSQ.connect(config.host, config.port);

nsq.on('error', function(e) {
	Util.error(Util.inspect(e, false, null) + "\n" + e.stack);
});

Util.log("Subscribe");
nsq.subscribe('foo', 'bar#ephemeral', function(err, sub) {
	if(err) {
		Util.error(Util.inspect(err, false, null) + "\n" + err.stack);
		return;
	}
	
	Util.log("Subscribed");
	
	sub.on('message', function(m) {
		Util.log("Message: " + Util.inspect(m, false, null));
		m.finish();
	});
	
//	sub.resume();
});

setInterval(function() {
	var data = { arm : "elbow"};
	Util.log("Publish " + Util.inspect(data));
	
	nsq.publish(new Message(), "foo", function(err, res) {
		if(err) {
			Util.error(err);
			return;
		}
		
		Util.log("Response: " + Util.inspect(res, false, null));
	});
}, 1000);
