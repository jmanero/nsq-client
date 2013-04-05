/**
 * Copyright (c) 2012 John Manero, Chris Baker, Dynamic Network Services Inc.
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
 * Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
 * WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
var EventEmitter = require('events').EventEmitter;
var Util = require('util');

var Queue = function(options) {
	options = options || {};
	EventEmitter.call(this);

	this.running = 0;
	this.tasks = [];
	this.results = [];

	this.paused = false;
	this.drainable = true;
	this.concurrency = options.concurrency || 1;

	// Default Work Mapper. Override Plz.
	this.worker = function(t, c) {
		c(null, t);
	};
};

Util.inherits(Queue, EventEmitter);

// Queue Mode. Aggregate results and return in drain
Queue.prototype.push = function(tt, meta) {
	var self = this;
	if (!Array.isArray(tt))
		tt = [ tt ];

	if (!tt.length) {
		if (!this.tasks.length && !this.running && this.drainable) {
			this.emit('drain', this.results);
			this.flush();
		}

		return;
	}

	tt.forEach(function(t) {
		self.tasks.push({
			work : t,
			meta : meta
		});
	});

	process.nextTick(reactor.bind(this));
};

// Buffer Mode. Return result in local callback
Queue.prototype.buffer = function(task, callback, meta) {
	this.tasks.push({
		work : task,
		callback : callback,
		meta : meta
	});

	process.nextTick(reactor.bind(this));
};

Queue.prototype.flush = function() {
	this.results = [];
};

Queue.prototype.pause = function() {
	this.paused = true;
};

Queue.prototype.resume = function() {
	this.paused = false;
	process.nextTick(reactor.bind(this));
};

// Idempotent non-blocking work loop (well, as non-blocking as the supplied worker function)
function reactor() {
	var self = this;
	if (this.running >= this.concurrency) // Fully saturated
		return;

	if (this.paused) // Paused. Terminate
		return;

	if (!this.tasks.length) { // Nothing else to do
		if (!this.running && this.drainable) { // This is the last one
			self.emit('drain', this.results);
			self.flush();
		}

		return;
	}

	this.running++;
	var task = this.tasks.shift();

	process.nextTick(function() {
		var called = false; // Protect against multiple calls of callback

		self.worker(task.work, function(err, res) {
			if (called)
				return;
			called = true;

			if (typeof task.callback === 'function') {
				process.nextTick(function() {
					task.callback(err, res);
				});
			}

			// Don't store results if we won't drain...
			if (self.drainable) {
				self.results.push({
					work : task.work,
					result : res,
					error : err
				});
			}

			self.running--;
			reactor.call(self); // Replace myself 1-1
		}, task.meta);
	});

	reactor.call(this); // Spawn until fully saturated
}

module.exports = Queue;
