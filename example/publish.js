var Crypto = require("crypto");
var NSQClient = require("../index");
var Util = require("util");

var client = new NSQClient({
  debug : true
});
client.on("error", function(err) {
    console.log("ERROR " + Util.inspect(err));
});
client.on("debug", function(event) {
    console.log("DEBUG " + Util.inspect(event));
});

var topics = process.argv.slice(2);
function randomishTopic() {
    var i = Math.floor(Math.random() * topics.length);
    return topics[i];
}

setInterval(function() {
    client.publish(randomishTopic(), { date : Date.now(), meh : Crypto.randomBytes(8).toString("hex") });
}, 50);

process.once("SIGINT", function() {
    process.once("SIGINT", process.exit);

    console.log();
    console.log("Closing client connections");
    console.log("Press CTL-C again to force quit");
    client.close(function() {
        process.exit();
    });
});
