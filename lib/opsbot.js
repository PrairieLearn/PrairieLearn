const ERR = require('async-stacktrace');
const request = require('request');
const config = require('./config');

module.exports = {};

module.exports.canSendMessages = () => {
    return !!config.secretSlackOpsBotEndpoint;
};

module.exports.sendMessage = (msg, callback) => {
    // No-op if there's no url specified
    if (!module.exports.canSendMessages()) {
        callback(null);
    }

    const options = {
        uri: config.secretSlackOpsBotEndpoint,
        method: 'POST',
        json: {
            text: msg,
        },
    };
    request(options, (err, res, body) => {
        if (ERR(err, callback)) return;
        callback(null, res, body);
    });
};

module.exports.sendProctorMessage = (msg, callback) => {
    // No-op if there's no url specified
    if (!module.exports.canSendMessages()) {
        callback(null);
    }

    const options = {
        uri: config.secretSlackOpsBotEndpoint,
        method: 'POST',
        json: {
            text: msg,
            channel: config.secretSlackProctorChannel,
            username: config.secretSlackProctorUsername,
        },
    };
    request(options, (err, res, body) => {
        if (ERR(err, callback)) return;
        callback(null, res, body);
    });
};
