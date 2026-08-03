import type { Redis } from 'ioredis';
import memoize from 'p-memoize';
import { z } from 'zod';

const ADD_TO_INTERVAL_USAGE_ONCE_SCRIPT = `
local request_field = 'request:' .. ARGV[1]
local previous_usage = redis.call('HGET', KEYS[1], request_field)
if previous_usage then
  return previous_usage
end

local usage = tonumber(redis.call('HGET', KEYS[1], 'usage')) or 0
local next_usage = usage + tonumber(ARGV[2])
if next_usage > tonumber(ARGV[3]) then
  return next_usage
end

redis.call('HSET', KEYS[1], 'usage', next_usage, request_field, next_usage)
redis.call('EXPIRE', KEYS[1], ARGV[4], 'NX')
return next_usage
`;

interface RedisRateLimiterOptions {
  redis: () => Redis;
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

  private getRedis = memoize(async () => this.options.redis());

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
   * Adds usage at most once for a request, provided the addition does not exceed the limit.
   * Retries return the usage recorded for the original request, so they receive the same
   * rate-limit decision even if later requests have exhausted the interval's budget.
   */
  async addToIntervalUsageOnce({
    key,
    amount,
    requestId,
    limit,
  }: {
    key: string;
    amount: number;
    requestId: string;
    limit: number;
  }): Promise<number> {
    const redis = await this.getRedis();
    const usage = await redis.eval(
      ADD_TO_INTERVAL_USAGE_ONCE_SCRIPT,
      1,
      this.getKey(key),
      requestId,
      amount,
      limit,
      this.getTtl(),
    );
    return z.coerce.number().parse(usage);
  }

  async close() {
    const redis = await this.getRedis();
    await redis.quit().catch(() => {});
  }
}
