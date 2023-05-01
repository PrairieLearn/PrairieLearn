// @ts-check
const ERR = require('async-stacktrace');
const redis = require('redis');
const redisLru = require('redis-lru');
const { LRUCache } = require('lru-cache');
const util = require('util');

const { config } = require('./config');
const { logger } = require('@prairielearn/logger');

let cacheEnabled = false;
let cacheType;
let cache;
let client;

module.exports.init = function (callback) {
  cacheType = config.questionRenderCacheType;
  if (!cacheType || cacheType === 'none') {
    // No caching
    cacheEnabled = false;
    return callback(null);
  }

  if (cacheType === 'redis') {
    if (!config.redisUrl) return callback(new Error('redisUrl not set in config'));
    cacheEnabled = true;
    client = redis.createClient({
      url: config.redisUrl,
    });
    client.on('error', (err) => logger.error('Redis error', err));
    cache = redisLru(client, {
      max: config.questionRenderCacheMaxItems,
      maxAge: config.questionRenderCacheMaxAgeMilliseconds,
    });
  } else if (cacheType === 'memory') {
    cacheEnabled = true;
    cache = new LRUCache({
      max: config.questionRenderCacheMaxItems,
    });
  } else {
    cacheEnabled = false;
    return callback(new Error(`Unknown cache type "${cacheType}"`));
  }

  callback(null);
};

module.exports.set = function (key, value, maxAgeMS = null) {
  if (!cacheEnabled) return;

  switch (cacheType) {
    case 'memory':
      if (maxAgeMS) {
        cache.set(key, value, { ttl: maxAgeMS });
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
        cache
          .set(key, value, maxAgeMS)
          .catch((_err) => logger.error('Cache set error', { key, maxAgeMS }));
      } else {
        // we don't log the error because it contains the cached value, which can be huge and which fills up the logs
        cache.set(key, value).catch((_err) => logger.error('Cache set error', { key }));
      }
      break;
    default:
      throw new Error(`Unknown cache type "${cacheType}"`);
  }
};

/**
 * Calls the callback with the value if it exists in the cache, or null otherwise.
 *
 * @param {string} key The key to look up in the cache
 */
module.exports.getAsync = async function (key) {
  if (!cacheEnabled) return null;

  switch (cacheType) {
    case 'memory':
      return cache.get(key) ?? null;
    case 'redis':
      return cache.get(key);
    default:
      throw new Error(`Unknown cache type "${cacheType}"`);
  }
};

module.exports.get = util.callbackify(module.exports.getAsync);

/**
 * Clears all entries from the cache. Mostly used to avoid leaking memory
 * during testing.
 */
module.exports.reset = function (callback) {
  if (!cacheEnabled) return callback(null);

  switch (cacheType) {
    case 'memory':
      cache.clear();
      callback(null);
      break;
    case 'redis':
      cache
        .reset()
        .then(() => callback(null))
        .catch(callback);
      break;
    default:
      callback(new Error(`Unknown cache type "${cacheType}"`));
  }
};

/**
 * Closes and deletes the cache itself.
 */
module.exports.close = function (callback) {
  if (!cacheEnabled) return callback(null);
  cacheEnabled = false;

  if (cacheType === 'redis') {
    client.quit((err) => {
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
