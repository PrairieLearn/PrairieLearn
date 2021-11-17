const ERR = require('async-stacktrace');
const request = require('request');
const util = require('util');
const detectMocha = require('detect-mocha');
const _ = require('lodash');

const error = require('../prairielib/lib/error');
const config = require('./config');
const logger = require('./logger');

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
  if (detectMocha()) return callback(null, { statusCode: '200' }, 'Dummy test body');
  request(options, (err, res, body) => {
    if (ERR(err, callback)) return;
    callback(null, res, body);
  });
};

module.exports.sendMessageAsync = util.promisify((msg, callback) =>
  module.exports.sendMessage(msg, (err, res, body) => callback(err, { res, body }))
);

/**
 * General interface to send a message from PrairieLearn to Slack.
 * @param msg String message to send.
 * @param channel Channel to send to.  Private channels must have the bot added.
 * @param options Any extra options to send in the request, pass in an empty object ({}) for none.
 * @param callback Function that is called after the message is sent.
 * Called with callback(err, response, body)
 */
module.exports.sendSlackAlmaMessage = (msg, channel, options, callback) => {
  /* Fall-back to the old token config if it exists */
  const token = config.secretSlackToken || config.secretSlackProctorToken;

  /* Log the message if there's no token specified */
  if (!token || !channel) {
    logger.info(`Alma message:\n${msg}`);
    return callback(null);
  }

  let default_options = {
    uri: 'https://slack.com/api/chat.postMessage',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    json: {
      text: msg,
      channel: channel,
      as_user: true,
    },
  };
  _.defaultsDeep(default_options, options);

  if (detectMocha()) return callback(null, { statusCode: '200' }, 'Dummy test body');
  request(default_options, (err, res, body) => {
    if (ERR(err, callback)) return;
    if (!body.ok) {
      callback(
        error.makeWithData(`Error sending message to ${default_options.json.channel}`, { body })
      );
      return;
    }
    callback(null, res, body);
  });
};

module.exports.sendSlackAlmaMessageAsync = util.promisify((msg, channel, options, callback) =>
  module.exports.sendSlackAlmaMessage(msg, (err, res, body) => callback(err, { res, body }))
);

/**
 * Send a message to the secret proctor channel on Slack.
 * @param msg String message to send.
 * @param callback Function that is called after the message is sent.
 * Called with callback(err, response, body)
 */
module.exports.sendProctorMessage = (msg, callback) => {
  module.exports.sendSlackAlmaMessage(msg, config.secretSlackProctorChannel, {}, (err, res) => {
    if (ERR(err, callback)) return;
    callback(null, res);
  });
};

module.exports.sendProctorMessageAsync = (msg) => {
  return module.exports.sendSlackAlmaMessageAsync(msg, config.secretSlackProctorChannel, {});
};

/**
 * Send a message to the secret course requests channel on Slack.
 * @param msg String message to send.
 * @param callback Function that is called after the message is sent.
 * Called with callback(err, response, body)
 */
module.exports.sendCourseRequestMessage = (msg, callback) => {
  module.exports.sendSlackAlmaMessage(
    msg,
    config.secretSlackCourseRequestChannel,
    {},
    (err, res) => {
      if (ERR(err, callback)) return;
      callback(null, res);
    }
  );
};

module.exports.sendCourseRequestMessageAsync = (msg) => {
  return module.exports.sendSlackAlmaMessageAsync(msg, config.secretSlackCourseRequestChannel, {});
};
