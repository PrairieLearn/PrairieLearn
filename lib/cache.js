const redis = require('redis');
const redisLru = require('redis-lru');
const lru = require('lru-cache');

const config = require('./config');
const logger = require('./logger');

let cacheType;
let cache;

module.exports.init = function(callback) {
    if (config.redisUrl) {
        cacheType = 'redis';
        const client = redis.createClient({
            url: config.redisUrl,
        });
        client.on('error', (err) => logger.error(err));
        // This max is completely arbitrary
        cache = redisLru(client, 100000);
    } else {
        cacheType = 'lru';
        cache = lru({
            max: 10000000,
            length: n => n.length,
        });
    }

    callback(null);
};

module.exports.set = function(key, value) {
    switch(cacheType) {
        case 'lru':
            cache.set(key, value);
            break;
        case 'redis':
            // This returns a promise, but we don't want to wait for this data
            // to reach the cache before continuing, and we don't *really*
            // care if it errors
            cache.set(key, value).catch(err => logger.error(err));
            break;
        default:
            throw new Error(`Unknown cache type "${cacheType}"`);
    }
};

/**
 * Calls the callback with the value if it exists in the cache, or null otherwise.
 */
module.exports.get = function(key, callback) {
    let val;
    switch(cacheType) {
        case 'lru':
            val = cache.get(key);
            if (val === undefined) val = null;
            callback(null, val);
            break;
        case 'redis':
            cache.get(key).then(val => callback(null, val)).catch(callback);
            break;
        default:
            callback(new Error(`Unknown cache type "${cacheType}"`));
    }
};

/**
 * Clears all entries from the cache. Mostly used to avoid leaking memory
 * during testing.
 */
module.exports.reset = function(callback) {
    switch(cacheType) {
        case 'lru':
            cache.reset();
            callback(null);
            break;
        case 'redis':
            cache.reset().then(() => callback(null)).catch(callback);
            break;
        default:
            callback(new Error(`Unknown cache type "${cacheType}"`));
    }
};
