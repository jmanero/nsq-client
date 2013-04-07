NSQ Client for Node.JS
======================
A simple implementation of the NSQ-V2 protocol using native Buffer objects,
based entirely upon the protocol documentation found in
[Bitly's GitHub project](https://github.com/bitly/nsq/blob/master/docs/protocol.md).

### Connection
_Stable: A single TCP connection to a single `nsqd` instance_

    var NSQ = require('nsq-client');
    var Client = NSQ.Connection
    var Message = NSQ.Message;
    
    var Util = require('util');
    
    var c = Client.connect(<hostname>[, <port>]); // Defaults to port 4150
    
    // Optional callback...
    c.subscribe("foo", "bar", function() {
    	// Is done.
    });
    
    c.on('message', function(msg, meta) {
        console.log("NSQ ID is " + message.id);
        console.log("This is the " + msg.attempts
            + " attempt to deliver this message" + (msg.attempts > 5 ? "!" : ""));
        console.log("Data: " + Util.inspect(msg.data, false, null));
        
        // Meta
        console.log("Message data is " + meta.size + " bytes long");
        console.log("The NSQ frame type of this message is " + meta.type
            + " (if it's not 2, something's wrong...)")
    });
    
    c.ready(3);
    
     // topic is "foo", in message constructor
    c.publish(new Message({ some : "JSON-serializable Object/string/whatever"}, "foo"))
    
    c.close();
    

### Clustered Client
_Alpha Functionality: Use `lookupd` to connect to an array of `nsqd` instances_

    var NSQ = require('nsq-client');
    
    var cluster = new NSQ.Cluster(lookupd.host, lookupd.port);
    var topic = cluster.connect("foo");
    
    // Filter duplicated messages
    topic.mutex = function(message, result) {
        DB.update({ id : message.id, won : false }, { $set : { won : true } }, function(err, count) {
            return(err, !!count); // err will requeue message; count == false will finish message and drop it;
            // count == true will emit message to application
        });
    };
    
    topic.on('message', function(m) {
        
        if(m.a)
	        m.finish();
	    else
	    	m.requeue();
        
    })
    topic.subscribe("bar#ephemeral");
    
    topic.publish(new Message({ some : "JSON-serializable Object/string/whatever"}, "foo"))

### Not Implemented... Yet
 * `MPUB` operation

### Notes
 * These docs are (clearly) far from complete. I'm happy to consider pull requests from anyone who would like to
 contribute to them; or to anything in this repo for that matter...
 * In general, methods exposed by instantiated `Connection` objects accept a callback. At this time, execution of said
 callbacks only indicates that the underlying NSQ message was flushed from the buffer of the client TCP socket, or an
 input error (e.g. bad topic or channel string) occurred and no message was sent. Start with the
 [NodeJS net.Socket](http://nodejs.org/docs/v0.8.19/api/net.html#net_socket_write_data_encoding_callback) documentation
 for insight into the behavior of the `Socket.write()` method.
 * Correlation of requests and errors is somewhat difficult due to the asynchronous nature of the NSQ TCP protocol.
 For now, `Connection` objects just emit `error` events when `error`-type frames are received. I'm open to suggestions
 as to a reliable way to bubble errors back up to the correct callback...

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
