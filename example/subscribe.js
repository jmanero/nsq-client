var NSQClient = require("../index");
var OS = require("os");
var Util = require("util");

var client = new NSQClient({
  debug: true
});

var channel = OS.hostname();

// Debugging Output
client.on("error", function(error) {
  console.log("ERROR " + Util.inspect(error));
});
client.on("debug", function(event) {
  console.log("DEBUG " + Util.inspect(event));
});

// Subscribe to topics defined on stdin
process.argv.slice(2).forEach(function(topic) {
  console.log("Subscribing to " + topic + "/" + channel);
  var subscriber = client.subscribe(topic, channel, {
    ephemeral: true
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
