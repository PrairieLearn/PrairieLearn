import type { Redis } from 'ioredis';
import memoize from 'p-memoize';
import { z } from 'zod';

const AllocationSchema = z.object({
  amount: z.number().nonnegative(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});

// Keep the allocation decision and counter update atomic. A retry after a lost
// reply or a database rollback must not consume the same allowance twice.
const allocateScript = `
local saved = redis.call('GET', KEYS[2])
if saved then return saved end
local used = tonumber(redis.call('GET', KEYS[1]) or '0')
local amount = math.max(0, math.min(tonumber(ARGV[1]), tonumber(ARGV[2]) - used))
if amount > 0 then
  redis.call('INCRBYFLOAT', KEYS[1], amount)
  redis.call('PEXPIREAT', KEYS[1], ARGV[5])
end
local result = cjson.encode({amount = amount, startsAt = ARGV[3], endsAt = ARGV[4]})
redis.call('SET', KEYS[2], result, 'PXAT', ARGV[5])
return result
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

  /** Allocate up to the remaining allowance; retry identities expire with their bucket. */
  async allocateIntervalUsage({
    key,
    allocationId,
    amount,
    limit,
  }: {
    key: string;
    allocationId: string;
    amount: number;
    limit: number;
  }) {
    const redis = await this.getRedis();
    const intervalMs = this.options.intervalSeconds * 1000;
    const now = Date.now();
    const start = now - (now % intervalMs);
    const end = start + intervalMs;
    const bucket = `${this.options.keyPrefix()}rate-limiter:interval:${start}:${key}`;
    const result = await redis.eval(
      allocateScript,
      2,
      bucket,
      `${bucket}:allocation:${allocationId}`,
      amount,
      limit,
      new Date(start).toISOString(),
      new Date(end).toISOString(),
      end,
    );
    return AllocationSchema.parse(JSON.parse(z.string().parse(result)));
  }

  async close() {
    const redis = await this.getRedis();
    await redis.quit().catch(() => {});
  }
}
