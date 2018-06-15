const ERR = require('async-stacktrace');
const request = require('request');

const error = require('@prairielearn/prairielib/error');
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
    // No-op if there's no token specified
    if (!config.secretSlackProctorToken) {
        callback(null);
    }

    const options = {
        uri: 'https://slack.com/api/chat.postMessage',
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.secretSlackProctorToken}`,
        },
        json: {
            text: msg,
            channel: config.secretSlackProctorChannel,
            as_user: true,
        },
    };
    request(options, (err, res, body) => {
        if (ERR(err, callback)) return;
        if (!body.ok) {
            callback(error.makeWithData('Error sending message to proctors', {body}));
            return;
        }
        callback(null, res, body);
    });
};
