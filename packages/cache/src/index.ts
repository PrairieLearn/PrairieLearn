import { Redis } from 'ioredis';
import { LRUCache } from 'lru-cache';
import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';
import assert from 'node:assert';

class Cache {
  enabled = false;
  type = 'none';
  memoryCache?: LRUCache<string, string>;
  redisClient?: Redis;
  keyPrefix = '';

  async init(config: {
    type: 'none' | 'memory' | 'redis';
    keyPrefix: string;
    redisUrl?: string | null;
  }) {
    this.type = config.type;
    this.keyPrefix = config.keyPrefix;
    if (!this.type || this.type === 'none') {
      // No caching
      this.enabled = false;
      return;
    }

    if (this.type === 'redis') {
      if (!config.redisUrl) throw new Error('redisUrl not set in config');
      this.enabled = true;
      this.redisClient = new Redis(config.redisUrl);
      this.redisClient.on('error', (err) => {
        logger.error('Redis error', err);
        Sentry.captureException(err);
      });
    } else if (this.type === 'memory') {
      this.enabled = true;
      this.memoryCache = new LRUCache({
        // The in-memory cache is really only suited for development, so we'll
        // hardcode a relatively low limit here.
        max: 1000,
      });
    } else {
      throw new Error(`Unknown cache type "${this.type}"`);
    }
  }

  set(key: string, value: any, maxAgeMS: number) {
    if (!this.enabled) return;

    const scopedKey = this.keyPrefix + key;

    switch (this.type) {
      case 'memory': {
        assert(this.memoryCache, 'Memory cache is enabled but not configured');
        this.memoryCache.set(scopedKey, JSON.stringify(value), { ttl: maxAgeMS });
        break;
      }

      case 'redis': {
        // This returns a promise, but we don't want to wait for this data
        // to reach the cache before continuing, and we don't *really*
        // care if it errors.
        //
        // We don't log the error because it contains the cached value,
        // which can be huge and which fills up the logs.
        assert(this.redisClient, 'Redis client is enabled but not configured');
        this.redisClient
          .set(scopedKey, JSON.stringify(value), 'PX', maxAgeMS)
          .catch((_err) => logger.error('Cache set error', { key, scopedKey, maxAgeMS }));
        break;
      }
    }
  }

  async del(key: string) {
    if (!this.enabled) return;

    const scopedKey = this.keyPrefix + key;

    switch (this.type) {
      case 'memory': {
        assert(this.memoryCache, 'Memory cache is enabled but not configured');
        this.memoryCache.delete(scopedKey);
        break;
      }

      case 'redis': {
        assert(this.redisClient, 'Redis client is enabled but not configured');
        await this.redisClient.del(scopedKey);
        break;
      }
    }
  }

  /**
   * Returns the value for the corresponding key if it exists in the cache; null otherwise.
   */
  async get(key: string): Promise<any> {
    if (!this.enabled) return null;

    const scopedKey = this.keyPrefix + key;

    switch (this.type) {
      case 'memory': {
        assert(this.memoryCache, 'Memory cache is enabled but not configured');
        const value = this.memoryCache.get(scopedKey);
        if (typeof value === 'string') {
          return JSON.parse(value);
        }
        return undefined;
      }

      case 'redis': {
        assert(this.redisClient, 'Redis client is enabled but not configured');
        const value = await this.redisClient.get(scopedKey);
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
    if (!this.enabled) return;

    switch (this.type) {
      case 'memory': {
        assert(this.memoryCache, 'Memory cache is enabled but not configured');
        this.memoryCache.clear();
        break;
      }

      case 'redis': {
        let cursor = '0';
        do {
          assert(this.redisClient, 'Redis client is enabled but not configured');
          const reply = await this.redisClient.scan(
            cursor,
            'MATCH',
            `${this.keyPrefix}*`,
            'COUNT',
            1000,
          );
          cursor = reply[0];

          const keys = reply[1];
          if (keys.length > 0) {
            assert(this.redisClient, 'Redis client is enabled but not configured');
            await this.redisClient.del(keys);
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
    if (!this.enabled) return;
    this.enabled = false;

    if (this.type === 'redis') {
      assert(this.redisClient, 'Redis client is enabled but not configured');
      await this.redisClient.quit();
    }
  }
}

export const cache = new Cache();
