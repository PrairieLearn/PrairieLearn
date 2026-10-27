import { Redis } from 'ioredis';
import { expect, it } from 'vitest';

import { config } from './config.js';
import { RedisRateLimiter } from './redis-rate-limiter.js';

it('allocates atomically, replays without double consumption, and expires all bucket state', async () => {
  const redis = new Redis<'legacy'>(config.nonVolatileRedisUrl!);
  const prefix = `rate-limiter-test:${crypto.randomUUID()}:`;
  const limiter = new RedisRateLimiter({
    redis: () => redis,
    keyPrefix: () => prefix,
    intervalSeconds: 3600,
  });
  const allocate = (allocationId: string) =>
    limiter.allocateIntervalUsage({ key: 'user:1', allocationId, amount: 3000, limit: 5000 });
  try {
    const [first, retry] = await Promise.all([allocate('first'), allocate('first')]);
    expect(first).toEqual(retry);
    expect(first.amount).toBe(3000);
    expect((await allocate('second')).amount).toBe(2000);
    expect((await allocate('denied')).amount).toBe(0);
    expect(await limiter.getIntervalUsage('user:1')).toBe(5000);
    const keys = await redis.keys(`${prefix}*`);
    const ttls = await Promise.all(keys.map((key) => redis.pttl(key)));
    expect(ttls).not.toHaveLength(0);
    expect(Math.min(...ttls)).toBeGreaterThan(0);
    expect(Math.max(...ttls)).toBeLessThanOrEqual(3600_000);
  } finally {
    for (const key of await redis.keys(`${prefix}*`)) await redis.del(key);
    await limiter.close();
  }
});
