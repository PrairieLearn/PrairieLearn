import { Redis } from 'ioredis';

import { logger } from '@prairielearn/logger';

import { config } from '../../../lib/config.js';
import { RedisRateLimiter } from '../../../lib/redis-rate-limiter.js';

const COURSE_AGENT_CREDIT_CHUNK_MILLI_DOLLARS = 3_000;
const COURSE_AGENT_HOURLY_ALLOCATION_LIMIT_MILLI_DOLLARS = 50_000;

const rateLimiter = new RedisRateLimiter({
  redis: () => {
    if (!config.nonVolatileRedisUrl) throw new Error('nonVolatileRedisUrl must be set in config');
    const redis = new Redis<'legacy'>(config.nonVolatileRedisUrl);
    redis.on('error', (error) => logger.error('Course agent Redis error', error));
    return redis;
  },
  keyPrefix: () => config.cacheKeyPrefix + 'course-agent-credit:',
  intervalSeconds: 3600,
});

export async function allocateCourseAgentBudget({
  userId,
  agentId,
  sequence,
}: {
  userId: string;
  agentId: string;
  sequence: number;
}) {
  return rateLimiter.allocateIntervalUsage({
    key: `user:${userId}`,
    allocationId: `${agentId}:${sequence}`,
    amount: COURSE_AGENT_CREDIT_CHUNK_MILLI_DOLLARS,
    limit: COURSE_AGENT_HOURLY_ALLOCATION_LIMIT_MILLI_DOLLARS,
  });
}
