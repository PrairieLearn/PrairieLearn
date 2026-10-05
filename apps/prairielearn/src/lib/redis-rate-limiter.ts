import type { Redis } from 'ioredis';
import memoize from 'p-memoize';
import { z } from 'zod';

interface RedisRateLimiterOptions {
  redis: () => Redis | Promise<Redis>;
  keyPrefix: () => string;
  /**
   * NOTE: changing the interval after deployment will result in unexpected
   * behavior with existing rate limits. Change with caution.
   */
  intervalSeconds: number;
}

/**
 * Implement a simple Redis-backed rate limiter that tracks usage over fixed time intervals.
 *
 * For a given key provided to `getIntervalUsage` and `addToIntervalUsage`, the actual key
 * stored in redis will be the following:
 *
 * ```txt
 * {keyPrefix}rate-limiter:interval:{intervalStart}:{key}
 * ```
 */
export class RedisRateLimiter {
  constructor(private options: RedisRateLimiterOptions) {}

  private redis?: Redis;
  private getRedis = memoize(async () => {
    this.redis = await this.options.redis();
    return this.redis;
  });

  private getKey(key: string): string {
    const keyPrefix = this.options.keyPrefix();
    const intervalMs = this.options.intervalSeconds * 1000;
    const intervalStart = Date.now() - (Date.now() % intervalMs);
    return `${keyPrefix}rate-limiter:interval:${intervalStart}:${key}`;
  }

  private parseNumber(value: string | null): number {
    try {
      return z.coerce.number().parse(value ?? 0);
    } catch {
      return 0;
    }
  }

  private getTtl(): number {
    // We accept the possibility of a small amount of clock skew here.
    return Math.ceil(
      this.options.intervalSeconds - ((Date.now() / 1000) % this.options.intervalSeconds),
    );
  }

  async getIntervalUsage(key: string): Promise<number> {
    const redis = await this.getRedis();
    return this.parseNumber(await redis.get(this.getKey(key)));
  }

  async addToIntervalUsage(key: string, amount: number): Promise<number> {
    const redis = await this.getRedis();
    const prefixedKey = this.getKey(key);

    // We use `NX` to avoid overwriting an existing TTL if one is already set.
    const result = await redis
      .multi()
      .incrbyfloat(prefixedKey, amount)
      .expire(prefixedKey, this.getTtl(), 'NX')
      .exec();
    const incrementResult = result?.[0];
    if (!incrementResult) throw new Error('Redis rate-limit increment returned no result');
    const [err, usage] = incrementResult;
    if (err) throw err;

    const [expireErr] = result[1];
    if (expireErr) throw expireErr;

    return z.coerce.number().parse(usage);
  }

  /**
   * Reconcile an absolute cumulative total into the current interval. The
   * watermark outlives interval buckets: repeats, stale snapshots, and retries
   * after a partial PostgreSQL/Redis failure cannot charge the same work twice.
   */
  async reconcileCumulativeUsage(
    key: string,
    identity: string,
    amount: number,
    version: number,
  ): Promise<number> {
    z.number().nonnegative().parse(amount);
    z.number().int().nonnegative().parse(version);
    const redis = await this.getRedis();
    const result = await redis.eval(
      `
      local prior = redis.call('HMGET', KEYS[1], 'amount', 'version')
      local amount = tonumber(ARGV[1])
      local version = tonumber(ARGV[2])
      local previous = tonumber(prior[1]) or 0
      local previousVersion = tonumber(prior[2]) or -1
      if version <= previousVersion then return redis.call('GET', KEYS[2]) or '0' end
      if amount < previous then return redis.error_reply('Cumulative usage decreased') end
      local usage = redis.call('INCRBYFLOAT', KEYS[2], amount - previous)
      redis.call('EXPIRE', KEYS[2], ARGV[3], 'NX')
      redis.call('HSET', KEYS[1], 'amount', ARGV[1], 'version', ARGV[2])
      return usage
    `,
      2,
      `${this.options.keyPrefix()}rate-limiter:watermark:${identity}`,
      this.getKey(key),
      amount,
      version,
      this.getTtl(),
    );
    return z.coerce.number().parse(result);
  }

  async close() {
    await this.redis?.quit().catch(() => this.redis?.disconnect());
  }
}
