import type { Redis } from 'ioredis';
import memoize from 'p-memoize';
import { z } from 'zod';

interface RedisRateLimiterOptions {
  redis: () => Redis;
  keyPrefix: () => string;
  /**
   * NOTE: changing the interval after deployment will result in unexpected
   * behavior with existing rate limits. Change with caution.
   */
  intervalSeconds: number;
}

export class RedisRateLimiter {
  constructor(private options: RedisRateLimiterOptions) {}

  private getRedis = memoize(async () => this.options.redis());

  private getKey(key: string): string {
    const keyPrefix = this.options.keyPrefix();
    const intervalMs = this.options.intervalSeconds * 1000;
    const intervalStart = Date.now() - (Date.now() % intervalMs);
    return `${keyPrefix}rate-limiter:${key}:interval:${intervalStart}`;
  }

  private parseNumber(value: string | null): number {
    try {
      return z.coerce.number().parse(value ?? 0);
    } catch {
      return 0;
    }
  }

  async getIntervalUsage(key: string): Promise<number> {
    const redis = await this.getRedis();
    return this.parseNumber(await redis.get(this.getKey(key)));
  }

  async addToIntervalUsage(key: string, amount: number) {
    const redis = await this.getRedis();
    const prefixedKey = this.getKey(key);
    await redis.incrbyfloat(prefixedKey, amount);

    const ttl = this.options.intervalSeconds - ((Date.now() / 1000) % this.options.intervalSeconds);
    await redis.expire(prefixedKey, Math.ceil(ttl), 'NX');
  }
}
