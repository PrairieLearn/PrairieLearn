import { Redis } from 'ioredis';

import { logger } from '@prairielearn/logger';

import { config } from '../../../lib/config.js';
import { RedisRateLimiter } from '../../../lib/redis-rate-limiter.js';

const COURSE_AGENT_CREDIT_CHUNK_MILLI_DOLLARS = 3_000;
const COURSE_AGENT_HOURLY_USAGE_LIMIT_MILLI_DOLLARS = 50_000;

const rateLimiter = new RedisRateLimiter({
  redis: () => {
    if (!config.nonVolatileRedisUrl) throw new Error('nonVolatileRedisUrl must be set in config');
    const redis = new Redis<'legacy'>(config.nonVolatileRedisUrl);
    redis.on('error', (error) => logger.error('Course agent Redis error', error));
    return redis;
  },
  keyPrefix: () => config.cacheKeyPrefix + 'course-agent-usage:',
  intervalSeconds: 3600,
});

export async function allocateCourseAgentBudget(userId: string, reportedCostMilliDollars: number) {
  const start = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const used = await rateLimiter.getIntervalUsage(`user:${userId}`);
  // Include this report's cost before deciding; it reaches Redis after the SQL commit.
  return {
    amount:
      used + reportedCostMilliDollars < COURSE_AGENT_HOURLY_USAGE_LIMIT_MILLI_DOLLARS
        ? COURSE_AGENT_CREDIT_CHUNK_MILLI_DOLLARS
        : 0,
    resetsAt: new Date(start + 3_600_000).toISOString(),
  };
}

export async function addCourseAgentCostToIntervalUsage(userId: string, costMilliDollars: number) {
  await rateLimiter.addToIntervalUsage(`user:${userId}`, costMilliDollars);
}
