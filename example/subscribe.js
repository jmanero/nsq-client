var NSQClient = require("../index");
var OS = require("os");
var Util = require("util");

var client = new NSQClient();

var channel = OS.hostname();
process.argv.slice(2).forEach(function(topic) {
    console.log("Subscribing to " + topic + "/" + channel);
    var subscriber = client.subscribe(topic, channel, {
        ephemeral : true
    });
    subscriber.on("error", function(error) {
        console.log(topic + "::error " + Util.inspect(error));
    });
    subscriber.on("event", function() {
        console.log(topic + "::event " + Util.inspect(Array.apply(null, arguments)));
    });
    subscriber.on("message", function(message) {
        message.finish();
    });
});

process.once("SIGINT", function() {
    process.once("SIGINT", process.exit);
    
    console.log();
    console.log("Closing client connections");
    console.log("Press CTL-C again to force quit");
    client.close(function() {
        process.exit();
    });
});
