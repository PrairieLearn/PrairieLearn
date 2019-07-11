const redis = require('redis');

const config = require('./config');
const logger = require('./logger');

const callbacks = {};

module.exports.init = function(callback) {
    if (!config.redisUrl) {
        // Skip redis; distribute messages immediately to this machine
        this._useRedis = false;
        logger.info('Not using Redis for message passing');
        return callback(null);
    }
    this._useRedis = true;
    logger.info(`Connecting to Redis at ${config.redisUrl}`);

    const redisOptions = {
        url: config.redisUrl,
    };
    this._pub = redis.createClient(redisOptions);
    this._sub = redis.createClient(redisOptions);

    this._pub.on('error', (err) => {
        logger.error(err);
    });
    this._sub.on('error', (err) => {
        logger.error(err);
    });

    this._sub.on('message', (channel, rawMsg) => {
        try {
            const msg = JSON.parse(rawMsg);
            if (!('eventType' in msg) || !('data' in msg)) {
                // Malformed message
                return;
            }
            module.exports._handleMessage(channel, msg.eventType, msg.data);
        } catch (e) {
            logger.error(e);
        }
    });

    callback(null);
};

module.exports._handleMessage = function(channel, eventType, data) {
    if ((channel in callbacks) && (eventType in callbacks[channel])) {
        callbacks[channel][eventType].forEach(cb => cb(data));
    }
};

module.exports.emit = function(channel, eventType, data) {
    if (!this._useRedis) {
        // Skip redis and distribute message locally immediately
        module.exports._handleMessage(channel, eventType, data);
        return;
    }
    const msg = {
        eventType,
        data,
    };
    this._pub.publish(channel, JSON.stringify(msg));
};

module.exports.on = function(channel, eventType, callback) {
    if (!(channel in callbacks)) {
        callbacks[channel] = {};
        if (this._useRedis) {
            this._sub.subscribe(channel);
        }
    }
    if (!(eventType in callbacks[channel])) {
        callbacks[channel][eventType] = [];
    }
    callbacks[channel][eventType].push(callback);
};
