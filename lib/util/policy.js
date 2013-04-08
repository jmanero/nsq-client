/*******************************************************************************
 * Constants and helpers
 ******************************************************************************/
var Version = exports.VERSION = new Buffer("  V2", 'utf8');

var channelTest = /^[\.a-zA-Z0-9_\-#]{1,31}$/;
function validateChannel(str) {
	return channelTest.test(str);
}
exports.validateChannel = validateChannel;

var topicTest = /^[\.a-zA-Z0-9_\-]{1,31}$/;
function validateTopic(str) {
	return topicTest.test(str);
}
exports.validateTopic = validateTopic;
