/*******************************************************************************
 * Client Policy Constants and Helpers
 ******************************************************************************/
exports.VERSION = new Buffer("  V2", 'utf8');

const CHANNEL = exports.CHANNEL = /^[\.a-zA-Z0-9_\-]+(?=#ephemeral$|$)/;
exports.validChannel = function validateChannel(channel) {
    return CHANNEL.test(channel) && channel.length <= 32;
};

const TOPIC = exports.TOPIC = /^[\.a-zA-Z0-9_\-]{1,31}$/;
exports.validTopic = function validateTopic(topic) {
    return TOPIC.test(topic);
};

const EPHEMERAL = exports.EPHEMERAL = /#ephemeral$/;
exports.isEphemeral = function isEphemeral(channel) {
    return EPHEMERAL.test(channel);
};

const OK = exports.OK = /^OK&/;
exports.isOK = function(status) {
    return OK.test(status);
};
