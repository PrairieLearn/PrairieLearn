const ERR = require('async-stacktrace');
const redis = require('redis');
const redisLru = require('redis-lru');
const lru = require('lru-cache');

const config = require('./config');
const logger = require('./logger');

let cacheEnabled = false;
let cacheType;
let cache;
let client;

module.exports.init = function(callback) {
    cacheType = config.questionRenderCacheType;
    if (!cacheType || cacheType === 'none') {
        // No caching
        cacheEnabled = false;
        return callback(null);
    }

    if (cacheType === 'redis') {
        cacheEnabled = true;
        client = redis.createClient({
            url: config.redisUrl,
        });
        client.on('error', (err) => logger.error('Redis error', err));
        // This max is completely arbitrary
        cache = redisLru(client, 100000);
    } else if (cacheType === 'memory') {
        cacheEnabled = true;
        cache = new lru({
            max: 10000000,
            length: n => n.length,
        });
    } else {
        cacheEnabled = false;
        return callback(new Error(`Unknown cache type "${cacheType}"`));
    }

    callback(null);
};

module.exports.set = function(key, value, maxAgeMS=null) {
    if (!cacheEnabled) return;

    switch(cacheType) {
        case 'memory':
            if (maxAgeMS) {
                cache.set(key, value, maxAgeMS);
            } else {
                cache.set(key, value);
            }
            break;
        case 'redis':
            // This returns a promise, but we don't want to wait for this data
            // to reach the cache before continuing, and we don't *really*
            // care if it errors
            if (maxAgeMS) {
                // we don't log the error because it contains the cached value, which can be huge and which fills up the logs
                cache.set(key, value, 'PX', maxAgeMS).catch(_err => logger.error('Cache set error', {key, maxAgeMS}));
            } else {
                // we don't log the error because it contains the cached value, which can be huge and which fills up the logs
                cache.set(key, value).catch(_err => logger.error('Cache set error', {key}));
            }
            break;
        default:
            throw new Error(`Unknown cache type "${cacheType}"`);
    }
};

/**
 * Calls the callback with the value if it exists in the cache, or null otherwise.
 */
module.exports.get = function(key, callback) {
    if (!cacheEnabled) return callback(null, null);

    let val;
    switch(cacheType) {
        case 'memory':
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
    if (!cacheEnabled) return callback(null);

    switch(cacheType) {
        case 'memory':
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

/**
 * Closes and deletes the cache itself.
 */
module.exports.close = function(callback) {
    if (!cacheEnabled) return callback(null);
    cacheEnabled = false;

    if (cacheType === 'redis') {
        client.quit(err => {
            if (ERR(err, callback)) return;
            cache = null;
            client = null;
            callback(null);
        });
    } else if (cacheType === 'memory') {
        cache = null;
        callback(null);
    } else {
        callback(new Error(`Unknown cache type "${cacheType}"`));
    }
};
