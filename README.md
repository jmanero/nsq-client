NSQ Client for Node.JS
======================
A simple implementation of the NSQ-V2 protocol using native Buffer objects,
based entirely upon the protocol documentation found in
[Bitly's GitHub project](https://github.com/bitly/nsq/blob/master/docs/protocol.md).

### NSQ Cluster Client

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

### Not Implemented... Yet
 * `MPUB` operation

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
