import { randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';
import { afterEach, expect, it, vi } from 'vitest';

import { RedisRateLimiter } from '../../../lib/redis-rate-limiter.js';
import { withConfig } from '../../../tests/utils/config.js';

import { addCourseAgentCost, checkCourseAgentUsageLimits } from './usage-limits.js';
import { courseAgentCost, courseAgentTokenPricing } from './usage.js';

afterEach(() => vi.useRealTimers());
const identity = { userId: '1', courseId: '2' };

it('uses atomic increments and resets at the fixed hour boundary in Redis', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const start = Date.parse('2026-09-11T12:00:00Z');
  vi.setSystemTime(start + 1800000);
  const prefix = `course-agent-test:${randomUUID()}:`;
  const redis = new Redis();
  const limiter = new RedisRateLimiter({
    redis: () => redis,
    keyPrefix: () => prefix,
    intervalSeconds: 3600,
  });
  try {
    await Promise.all(Array.from({ length: 10 }, () => limiter.addToIntervalUsage('user:1', 0.25)));
    expect(await limiter.getIntervalUsage('user:1')).toBe(2.5);
    const ttl = await redis.ttl(`${prefix}rate-limiter:interval:${start}:user:1`);
    expect(ttl).toBeGreaterThan(1790);
    expect(ttl).toBeLessThanOrEqual(1800);
    vi.setSystemTime(start + 3600000);
    expect(await limiter.getIntervalUsage('user:1')).toBe(0);
  } finally {
    await redis.del(`${prefix}rate-limiter:interval:${start}:user:1`);
    await limiter.close();
  }
});

it.each(['user:1', 'course:2', 'global'])(
  'checks the %s limit with the existing interval interface',
  async (key) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T12:30:00Z'));
    const limiter = {
      getIntervalUsage: vi.fn(async (candidate: string) => (candidate === key ? 1 : 0)),
    };
    await withConfig(
      { courseAgentRateLimitDollars: { user: 1, course: 1, global: 1 } },
      async () => {
        expect(await checkCourseAgentUsageLimits(identity, limiter)).toMatchObject({
          allowed: false,
          message: expect.stringContaining('2026-09-11T13:00:00.000Z'),
        });
      },
    );
  },
);

it('charges all three scopes in dollars', async () => {
  const limiter = { addToIntervalUsage: vi.fn(async () => 0.25) };
  await addCourseAgentCost(identity, 0.25, limiter);
  expect(limiter.addToIntervalUsage.mock.calls).toEqual([
    ['user:1', 0.25],
    ['course:2', 0.25],
    ['global', 0.25],
  ]);
});

it('fails closed when Redis is unavailable', async () => {
  await expect(
    checkCourseAgentUsageLimits(identity, {
      getIntervalUsage: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
    }),
  ).rejects.toThrow('Redis unavailable');
});

it('prices token subsets only once and rejects unknown models', () => {
  const usage = {
    input_tokens: 1000,
    cache_read_tokens: 500,
    cache_write_tokens: 100,
    output_tokens: 200,
    reasoning_tokens: 150,
  };
  expect(courseAgentCost(usage, { input: 10, cachedInput: 1, cacheWrite: 12.5, output: 50 })).toBe(
    15.75,
  );
  expect(
    courseAgentCost(usage, {
      input: 10,
      cachedInput: 1,
      cacheWrite: 12.5,
      output: 50,
      longContextThreshold: 500,
    }),
  ).toBe(26.5);
  expect(() => courseAgentTokenPricing('unpriced-model')).toThrow('not configured');
});
