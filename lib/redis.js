const redis = require('redis');

const config = require('./config');
const logger = require('./logger');

const callbacks = {};

module.exports.init = function(callback) {
    const redisOptions = {
        url: config.redisUrl,
    };
    this.pub = redis.createClient(redisOptions);
    this.sub = redis.createClient(redisOptions);

    this.pub.on('error', (err) => {
        logger.error(err);
    });
    this.sub.on('error', (err) => {
        logger.error(err);
    });

    this.sub.on('message', (channel, rawMsg) => {
        try {
            const msg = JSON.parse(rawMsg);
            if (!('event' in msg) || !('data' in msg)) {
                // Malformed message
                return;
            }
            if ((channel in callbacks) && (msg.event in callbacks[channel])) {
                callbacks[channel][msg.event].forEach(cb => cb(msg.data));
            }
        } catch (e) {
            logger.error(e);
        }
    });

    callback(null);
};

module.exports.emit = function(channel, eventType, data) {
    const msg = {
        event: eventType,
        data,
    };
    this.pub.publish(channel, JSON.stringify(msg));
};

module.exports.on = function(channel, eventType, callback) {
    if (!(channel in callbacks)) {
        callbacks[channel] = {};
        this.sub.subscribe(channel);
    }
    if (!(eventType in callbacks[channel])) {
        callbacks[channel][eventType] = [];
    }
    callbacks[channel][eventType].push(callback);
};
