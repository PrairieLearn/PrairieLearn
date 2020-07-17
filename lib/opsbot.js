const ERR = require('async-stacktrace');
const request = require('request');
const util = require('util');
const detectMocha = require('detect-mocha');

const error = require('@prairielearn/prairielib/error');
const config = require('./config');

module.exports = {};

module.exports.canSendMessages = () => {
    if (detectMocha()) return true;
    return !!config.secretSlackOpsBotEndpoint;
};

module.exports.sendMessage = (msg, callback) => {
    // No-op if there's no url specified
    if (!module.exports.canSendMessages()) {
        return callback(null);
    }

    const options = {
        uri: config.secretSlackOpsBotEndpoint,
        method: 'POST',
        json: {
            text: msg,
        },
    };
    if (detectMocha()) return callback(null, {statusCode: '200'}, 'Dummy test body');
    request(options, (err, res, body) => {
        if (ERR(err, callback)) return;
        callback(null, res, body);
    });
};

module.exports.sendMessageAsync = util.promisify((msg, callback) =>
    module.exports.sendMessage(msg, (err, res, body) => callback(err, {res, body})),
);

module.exports.sendProctorMessage = (msg, callback) => {
    // No-op if there's no token specified
    if (!config.secretSlackProctorToken) {
        return callback(null);
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
    if (detectMocha()) return callback(null, {statusCode: '200'}, 'Dummy test body');
    request(options, (err, res, body) => {
        if (ERR(err, callback)) return;
        if (!body.ok) {
            callback(error.makeWithData('Error sending message to proctors', {body}));
            return;
        }
        callback(null, res, body);
    });
};

module.exports.sendProctorMessageAsync = util.promisify((msg, callback) =>
    module.exports.sendProctorMessage(msg, (err, res, body) => callback(err, {res, body})),
);

module.exports.sendCourseRequestMessage = (msg, callback) => {
    const endpoint = config.secretSlackCourseRequestEndpoint;
    if (!endpoint) {
        /* No-op if there's no endpoint specified */
        return null;
    }

    const options = {
        uri: endpoint,
        method: 'POST',
        json: {
            text: msg,
        },
    };
    if (detectMocha()) return callback({statusCode: '200'}, 'Dummy test body');
    request(options, (err, res, body) => {
        if (ERR(err, callback)) return;
        callback(null, res, body);
    });
};
