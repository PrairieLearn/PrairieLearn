import { Redis } from 'ioredis';
import { LRUCache } from 'lru-cache';
import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

class Cache {
  cacheEnabled = false;
  cacheType = 'none';
  memoryCache?: LRUCache<string, string>;
  client?: Redis;
  cacheKeyPrefix = 'prairielearn-cache:';

  async init(config: {
    cacheType: 'none' | 'memory' | 'redis';
    cacheKeyPrefix: string;
    redisUrl?: string | null;
  }) {
    this.cacheType = config.cacheType;
    this.cacheKeyPrefix = config.cacheKeyPrefix;
    if (!this.cacheType || this.cacheType === 'none') {
      // No caching
      this.cacheEnabled = false;
      return;
    }

    if (this.cacheType === 'redis') {
      if (!config.redisUrl) throw new Error('redisUrl not set in config');
      this.cacheEnabled = true;
      this.client = new Redis(config.redisUrl);
      this.client.on('error', (err) => {
        logger.error('Redis error', err);
        Sentry.captureException(err);
      });
    } else if (this.cacheType === 'memory') {
      this.cacheEnabled = true;
      this.memoryCache = new LRUCache({
        // The in-memory cache is really only suited for development, so we'll
        // hardcode a relatively low limit here.
        max: 1000,
      });
    } else {
      throw new Error(`Unknown cache type "${this.cacheType}"`);
    }
  }

  set(key: string, value: any, maxAgeMS: number) {
    if (!this.cacheEnabled) return;

    const scopedKey = this.cacheKeyPrefix + key;

    switch (this.cacheType) {
      case 'memory': {
        this.memoryCache?.set(scopedKey, JSON.stringify(value), { ttl: maxAgeMS });
        break;
      }

      case 'redis': {
        // This returns a promise, but we don't want to wait for this data
        // to reach the cache before continuing, and we don't *really*
        // care if it errors.
        //
        // We don't log the error because it contains the cached value,
        // which can be huge and which fills up the logs.
        this.client
          ?.set(scopedKey, JSON.stringify(value), 'PX', maxAgeMS)
          .catch((_err) => logger.error('Cache set error', { key, scopedKey, maxAgeMS }));
        break;
      }
    }
  }

  async del(key: string) {
    if (!this.cacheEnabled) return;

    const scopedKey = this.cacheKeyPrefix + key;

    switch (this.cacheType) {
      case 'memory': {
        this.memoryCache?.delete(scopedKey);
        break;
      }

      case 'redis': {
        await this.client?.del(scopedKey);
        break;
      }
    }
  }

  /**
   * Returns the value for the corresponding key if it exists in the cache; null otherwise.
   */
  async get(key: string): Promise<any> {
    if (!this.cacheEnabled) return null;

    const scopedKey = this.cacheKeyPrefix + key;

    switch (this.cacheType) {
      case 'memory': {
        const value = this.memoryCache?.get(scopedKey);
        if (typeof value === 'string') {
          return JSON.parse(value);
        }
        return undefined;
      }

      case 'redis': {
        const value = await this.client?.get(scopedKey);
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
    if (!this.cacheEnabled) return;

    switch (this.cacheType) {
      case 'memory': {
        this.memoryCache?.clear();
        break;
      }

      case 'redis': {
        let cursor = '0';
        do {
          if (!this.client) {
            throw new Error('Redis client not initialized');
          }
          const reply = await this.client.scan(
            cursor,
            'MATCH',
            `${this.cacheKeyPrefix}*`,
            'COUNT',
            1000,
          );
          cursor = reply[0];

          const keys = reply[1];
          if (keys.length > 0) {
            await this.client?.del(keys);
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
    if (!this.cacheEnabled) return;
    this.cacheEnabled = false;

    if (this.cacheType === 'redis') {
      await this.client?.quit();
    }
  }
}

export const cache = new Cache();
