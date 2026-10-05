import { randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { RedisRateLimiter } from './redis-rate-limiter.js';

let redis: Redis;
let limiter: RedisRateLimiter;
let prefix: string;
beforeEach(async () => {
  prefix = `course-agent-limiter-test:${randomUUID()}:`;
  redis = new Redis<'legacy'>('redis://localhost:6379', { lazyConnect: true });
  await redis.connect();
  limiter = new RedisRateLimiter({
    redis: () => redis,
    keyPrefix: () => prefix,
    intervalSeconds: 3600,
  });
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(keys);
  await limiter.close();
  redis.disconnect();
});

test('reconciles concurrent repeats and stale snapshots once', async () => {
  await Promise.all(
    Array.from({ length: 20 }, () =>
      limiter.reconcileCumulativeUsage('user', 'conversation', 2, 1),
    ),
  );
  expect(await limiter.getIntervalUsage('user')).toBe(2);
  await limiter.reconcileCumulativeUsage('user', 'conversation', 5, 3);
  await limiter.reconcileCumulativeUsage('user', 'conversation', 3, 2);
  expect(await limiter.getIntervalUsage('user')).toBe(5);
  await expect(limiter.reconcileCumulativeUsage('user', 'conversation', 1, 4)).rejects.toThrow(
    'decreased',
  );
  expect(await limiter.getIntervalUsage('user')).toBe(5);
});
test('keeps watermarks across hour boundaries and attributes late deltas to the current hour', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const start = Math.floor(Date.now() / 3600000) * 3600000;
  vi.setSystemTime(start + 1000);
  await limiter.reconcileCumulativeUsage('user', 'conversation', 2, 1);
  const oldKey = `${prefix}rate-limiter:interval:${start}:user`;
  expect(await redis.ttl(oldKey)).toBeGreaterThan(0);
  vi.setSystemTime(start + 3601000);
  expect(await limiter.reconcileCumulativeUsage('user', 'conversation', 2, 1)).toBe(0);
  expect(await limiter.reconcileCumulativeUsage('user', 'conversation', 5, 2)).toBe(3);
  expect(await redis.get(oldKey)).toBe('2');
  expect(await redis.ttl(`${prefix}rate-limiter:watermark:conversation`)).toBe(-1);
});
test('retries safely after Redis wrote successfully but its acknowledgment was lost', async () => {
  const evalScript = redis.eval.bind(redis);
  vi.spyOn(redis, 'eval').mockImplementationOnce(async (...args) => {
    await evalScript(...args);
    throw new Error('Lost acknowledgment');
  });
  await expect(limiter.reconcileCumulativeUsage('user', 'conversation', 4, 1)).rejects.toThrow(
    'Lost acknowledgment',
  );
  await limiter.reconcileCumulativeUsage('user', 'conversation', 4, 1);
  expect(await limiter.getIntervalUsage('user')).toBe(4);
  await limiter.addToIntervalUsage('other', 2);
  expect(await limiter.getIntervalUsage('other')).toBe(2);
});

test('closing an unused limiter does not connect to Redis', async () => {
  const factory = vi.fn(() => redis);
  const unused = new RedisRateLimiter({
    redis: factory,
    keyPrefix: () => prefix,
    intervalSeconds: 3600,
  });
  await unused.close();
  expect(factory).not.toHaveBeenCalled();
});
