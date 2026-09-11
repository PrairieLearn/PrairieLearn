import { Redis } from 'ioredis';

import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import { config } from '../../../lib/config.js';
import { RedisRateLimiter } from '../../../lib/redis-rate-limiter.js';

const rateLimiter = new RedisRateLimiter({
  redis: () => {
    if (!config.nonVolatileRedisUrl) throw new Error('nonVolatileRedisUrl must be set in config');
    const redis = new Redis(config.nonVolatileRedisUrl);
    redis.on('error', (err) => {
      logger.error('Course agent Redis error', err);
      Sentry.withScope((scope) => {
        scope.clear();
        Sentry.captureException(err);
      });
    });
    return redis;
  },
  keyPrefix: () => config.cacheKeyPrefix + 'course-agent-usage:',
  intervalSeconds: 3600,
});

function limits({ userId, courseId }: { userId: string; courseId: string }) {
  return [
    { key: `user:${userId}`, dollars: config.courseAgentRateLimitDollars.user, scope: 'user' },
    {
      key: `course:${courseId}`,
      dollars: config.courseAgentRateLimitDollars.course,
      scope: 'course',
    },
    { key: 'global', dollars: config.courseAgentRateLimitDollars.global, scope: 'global' },
  ];
}

export async function checkCourseAgentUsageLimits(
  identity: { userId: string; courseId: string },
  limiter: Pick<RedisRateLimiter, 'getIntervalUsage'> = rateLimiter,
) {
  for (const { key, dollars, scope } of limits(identity)) {
    if ((await limiter.getIntervalUsage(key)) >= dollars) {
      return {
        allowed: false,
        message: `The course-agent ${scope} hourly usage limit has been reached. Try again after ${new Date(Math.floor(Date.now() / 3600000) * 3600000 + 3600000).toISOString()}.`,
      };
    }
  }
  return { allowed: true, message: null };
}

export async function addCourseAgentCost(
  identity: { userId: string; courseId: string },
  dollars: number,
  limiter: Pick<RedisRateLimiter, 'addToIntervalUsage'> = rateLimiter,
) {
  await Promise.all(limits(identity).map(({ key }) => limiter.addToIntervalUsage(key, dollars)));
}
