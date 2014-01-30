NSQ Client for Node.JS
======================
A simple implementation of the NSQ-V2 protocol using native Buffer objects,
based entirely upon the protocol documentation found in
[Bitly's GitHub project](http://bitly.github.io/nsq/clients/tcp_protocol_spec.html).

### NSQClient
_Publisher/Producer_ [examples/publish.js](https://github.com/jmanero/nsq-client/blob/master/example/publish.js)

```
var NSQClient = require("nsq-client");
var Util = require("util");
var Crypto = require("crypto");

var client = new NSQClient();
client.publisher().on("error", function() {
    Util.log("error " + Util.inspect(Array.apply(null, arguments)));
});
client.publisher().on("event", function() { // Debugging
    Util.log("event " + Util.inspect(Array.apply(null, arguments)));
});

var topics = process.argv.slice(2);
function randomishTopic() {
    return topics[Math.floor(Math.random() * topics.length)];
}

setInterval(function() {
    client.publish(randomishTopic(), { my_date : Date.now(), meh : Crypto.randomBytes(8).toString("hex") });
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
```
_Subscriber/Consumer_ [examples/subscribe.js](https://github.com/jmanero/nsq-client/blob/master/example/subscribe.js)

```
var NSQClient = require("nsq-client");
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
    subscriber.on("event", function() { // Debugging
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
```

### TODO
#### Release 1.0.0 (February 2014)
 * Major overhaul of the `Protocol` state machine
   * TCP failure tolerance and reconnection
   * Proper transaction handling for REQ/REP Commands (`IDENTIFY`, `SUB`, `PUB`, `CLS`)
   * Error response handling
 * Separation of the `Connection` controller from `NSQClient`. An instance of `NSQClient` stores connection data for a single `nsqd` and provides methods to create/access a publisher connection and to create subscriber connections.
 * Use [int64-native](https://npmjs.org/package/int64-native) to handle message timestamps
 
#### Someday
 * `MPUB`
 * Clustered operation
   * Discover `nsqd` instances and available topics with the `nsqlookupd` API
   * Provide schemes for `nsqd` failover, message de-duping

## MIT License
Copyright (c) 2013 John Manero, Dynamic Network Services Inc.

    Permission is hereby granted, free of charge, to any person obtaining a copy of
    this software and associated documentation files (the "Software"), to deal in
    the Software without restriction, including without limitation the rights to
    use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
    of the Software, and to permit persons to whom the Software is furnished to do
    so, subject to the following conditions:
    
    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
    
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
