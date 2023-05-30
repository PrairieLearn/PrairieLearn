import redis = require('redis');
import { LRUCache } from 'lru-cache';
import util = require('util');

import { config } from './config';
import { logger } from '@prairielearn/logger';

let cacheEnabled = false;
let cacheType: 'redis' | 'memory' | 'none';
let cache: LRUCache<string, string>;
let client: redis.RedisClientType;

export async function init() {
  cacheType = config.questionRenderCacheType;
  if (!cacheType || cacheType === 'none') {
    // No caching
    cacheEnabled = false;
    return;
  }

  if (cacheType === 'redis') {
    if (!config.redisUrl) throw new Error('redisUrl not set in config');
    cacheEnabled = true;
    client = redis.createClient({
      url: config.redisUrl,
    });
    client.on('error', (err) => logger.error('Redis error', err));
  } else if (cacheType === 'memory') {
    cacheEnabled = true;
    cache = new LRUCache({
      max: config.questionRenderCacheMaxItems,
    });
  } else {
    throw new Error(`Unknown cache type "${cacheType}"`);
  }
}

export function set(key: string, value: string | number | boolean, maxAgeMS?: number) {
  if (!cacheEnabled) return;

  switch (cacheType) {
    case 'memory': {
      cache.set(key, JSON.stringify(value), { ttl: maxAgeMS ?? undefined });
      break;
    }

    case 'redis': {
      // This returns a promise, but we don't want to wait for this data
      // to reach the cache before continuing, and we don't *really*
      // care if it errors.
      //
      // We don't log the error because it contains the cached value,
      // which can be huge and which fills up the logs.
      client
        .set(key, JSON.stringify(value), { PX: maxAgeMS ?? undefined })
        .catch((_err) => logger.error('Cache set error', { key, maxAgeMS }));
      break;
    }

    default: {
      throw new Error(`Unknown cache type "${cacheType}"`);
    }
  }
}

/**
 * Returns the value for the corresponding key if it exists in the cache; null otherwise.
 */
export async function getAsync(key: string): Promise<any> {
  if (!cacheEnabled) return null;

  switch (cacheType) {
    case 'memory': {
      const value = cache.get(key);
      if (typeof value === 'string') {
        return JSON.parse(value);
      }
      return null;
    }

    case 'redis': {
      const value = await client.get(key);
      if (typeof value === 'string') {
        return JSON.parse(value);
      }
      return null;
    }

    default: {
      throw new Error(`Unknown cache type "${cacheType}"`);
    }
  }
}

export const get = util.callbackify(getAsync);

/**
 * Clear all entries from the cache.
 */
export async function reset() {
  if (!cacheEnabled) return;

  switch (cacheType) {
    case 'memory': {
      cache.clear();
      break;
    }

    case 'redis': {
      let cursor = 0;
      do {
        const reply = await client.scan(cursor, { MATCH: '*', COUNT: 1000 });
        cursor = reply.cursor;
        await client.del(reply.keys);
      } while (cursor !== 0);
      break;
    }

    default: {
      throw new Error(`Unknown cache type "${cacheType}"`);
    }
  }
}

/**
 * Releases any connections associated with the cache.
 */
export async function close() {
  if (!cacheEnabled) return;
  cacheEnabled = false;

  if (cacheType === 'redis') {
    await client.quit();
  } else if (cacheType === 'memory') {
    // Nothing to do here.
  } else {
    throw new Error(`Unknown cache type "${cacheType}"`);
  }
}
