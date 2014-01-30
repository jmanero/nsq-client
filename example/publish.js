var Crypto = require("crypto");
var NSQClient = require("../index");
var Util = require("util");

var client = new NSQClient();
client.publisher().on("error", function() {
    console.log("error " + Util.inspect(Array.apply(null, arguments)));
});
client.publisher().on("event", function() {
    console.log("event " + Util.inspect(Array.apply(null, arguments)));
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
