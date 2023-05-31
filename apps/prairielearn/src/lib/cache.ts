import ERR = require('async-stacktrace');
import redis = require('redis');
import redisLru = require('redis-lru');
import { LRUCache } from 'lru-cache';
import util = require('util');

import { config } from './config';
import { logger } from '@prairielearn/logger';

let cacheEnabled = false;
let cacheType: 'none' | 'memory' | 'redis';
let cache: any;
let client: redis.RedisClient | null;

export function init(callback: (err?: Error | null) => void) {
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
}

export function set(key: string, value: any, maxAgeMS = null) {
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
}

/**
 * Calls the callback with the value if it exists in the cache, or null otherwise.
 */
export async function getAsync(key: string) {
  if (!cacheEnabled) return null;

  switch (cacheType) {
    case 'memory':
      return cache.get(key) ?? null;
    case 'redis':
      return cache.get(key);
    default:
      throw new Error(`Unknown cache type "${cacheType}"`);
  }
}

export const get = util.callbackify(getAsync);

/**
 * Clears all entries from the cache. Mostly used to avoid leaking memory
 * during testing.
 */
export function reset(callback: (err?: Error | null) => void) {
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
}

/**
 * Closes and deletes the cache itself.
 */
export function close(callback: (err?: Error | null) => void) {
  if (!cacheEnabled) return callback(null);
  cacheEnabled = false;

  if (cacheType === 'redis') {
    client?.quit((err) => {
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
}
