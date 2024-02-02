import { Redis } from 'ioredis';
import { LRUCache } from 'lru-cache';
import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

const CACHE_KEY_PREFIX = 'prairielearn-cache:';

let cacheEnabled = false;
let cacheType: 'redis' | 'memory' | 'none';
let memoryCache: LRUCache<string, string>;
let client: Redis;

function cacheKey(key: string): string {
  return CACHE_KEY_PREFIX + key;
}

class Cache {
  async init(config: { cacheType: 'none' | 'memory' | 'redis'; redisUrl: string | null }) {
    cacheType = config.cacheType;
    if (!cacheType || cacheType === 'none') {
      // No caching
      cacheEnabled = false;
      return;
    }

    if (cacheType === 'redis') {
      if (!config.redisUrl) throw new Error('redisUrl not set in config');
      cacheEnabled = true;
      client = new Redis(config.redisUrl);
      client.on('error', (err) => {
        logger.error('Redis error', err);
        Sentry.captureException(err);
      });
    } else if (cacheType === 'memory') {
      cacheEnabled = true;
      memoryCache = new LRUCache({
        // The in-memory cache is really only suited for development, so we'll
        // hardcode a relatively low limit here.
        max: 1000,
      });
    } else {
      throw new Error(`Unknown cache type "${cacheType}"`);
    }
  }

  set(key: string, value: any, maxAgeMS: number) {
    if (!cacheEnabled) return;

    const scopedKey = cacheKey(key);

    switch (cacheType) {
      case 'memory': {
        memoryCache.set(scopedKey, JSON.stringify(value), { ttl: maxAgeMS });
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
          .set(scopedKey, JSON.stringify(value), 'PX', maxAgeMS)
          .catch((_err) => logger.error('Cache set error', { key, scopedKey, maxAgeMS }));
        break;
      }
    }
  }

  async del(key: string) {
    if (!cacheEnabled) return;

    const scopedKey = cacheKey(key);

    switch (cacheType) {
      case 'memory': {
        memoryCache.delete(scopedKey);
        break;
      }

      case 'redis': {
        await client.del(scopedKey);
        break;
      }
    }
  }

  /**
   * Returns the value for the corresponding key if it exists in the cache; null otherwise.
   */
  async get(key: string): Promise<any> {
    if (!cacheEnabled) return null;

    const scopedKey = cacheKey(key);

    switch (cacheType) {
      case 'memory': {
        const value = memoryCache.get(scopedKey);
        if (typeof value === 'string') {
          return JSON.parse(value);
        }
        return undefined;
      }

      case 'redis': {
        const value = await client.get(scopedKey);
        if (typeof value === 'string') {
          return JSON.parse(value);
        }
        return undefined;
      }

      default: {
        return null;
      }
    }
  }

  /**
   * Clear all entries from the cache.
   */
  async reset() {
    if (!cacheEnabled) return;

    switch (cacheType) {
      case 'memory': {
        memoryCache.clear();
        break;
      }

      case 'redis': {
        let cursor = '0';
        do {
          const reply = await client.scan(cursor, 'MATCH', `${CACHE_KEY_PREFIX}*`, 'COUNT', 1000);
          cursor = reply[0];

          const keys = reply[1];
          if (keys.length > 0) {
            await client.del(keys);
          }
        } while (cursor !== '0');
        break;
      }
    }
  }
  /**
   * Releases any connections associated with the cache.
   */
  async close() {
    if (!cacheEnabled) return;
    cacheEnabled = false;

    if (cacheType === 'redis') {
      await client.quit();
    }
  }
}

export const cache = new Cache();
