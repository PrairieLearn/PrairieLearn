// @ts-check
const redis = require('redis');

const config = require('./config');
const logger = require('./logger');

const callbacks = {};

let useRedis = true;
/** @type {import('redis').RedisClient} */
let pub = null;
/** @type {import('redis').RedisClient} */
let sub = null;

module.exports.init = function (callback) {
  if (!config.redisUrl) {
    // Skip redis; distribute messages immediately to this machine
    useRedis = false;
    logger.info('Not using Redis for message passing');
    return callback(null);
  }

  logger.verbose(`Connecting to Redis at ${config.redisUrl}`);

  const redisOptions = {
    url: config.redisUrl,
  };
  pub = redis.createClient(redisOptions);
  sub = redis.createClient(redisOptions);

  pub.on('error', (err) => {
    logger.error('Redis publish error', err);
  });
  sub.on('error', (err) => {
    logger.error('Redis subscribe error', err);
  });

  sub.on('message', (channel, rawMsg) => {
    try {
      const msg = JSON.parse(rawMsg);
      if (!('eventType' in msg) || !('data' in msg)) {
        // Malformed message
        return;
      }
      module.exports._handleMessage(channel, msg.eventType, msg.data);
    } catch (e) {
      logger.error('Error on Redis message parse', e);
    }
  });

  callback(null);
};

module.exports._handleMessage = function (channel, eventType, data) {
  if (channel in callbacks && eventType in callbacks[channel]) {
    callbacks[channel][eventType].forEach((cb) => cb(data));
  }
};

module.exports.emit = function (channel, eventType, data) {
  if (!useRedis) {
    // Skip redis and distribute message locally immediately
    module.exports._handleMessage(channel, eventType, data);
    return;
  }
  const msg = {
    eventType,
    data,
  };
  pub.publish(channel, JSON.stringify(msg));
};

module.exports.on = function (channel, eventType, callback) {
  if (!(channel in callbacks)) {
    callbacks[channel] = {};
    if (useRedis) {
      sub.subscribe(channel);
    }
  }
  if (!(eventType in callbacks[channel])) {
    callbacks[channel][eventType] = [];
  }
  callbacks[channel][eventType].push(callback);
};
