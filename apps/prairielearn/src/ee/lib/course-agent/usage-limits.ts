import { Redis } from 'ioredis';
import memoize from 'p-memoize';
import { z } from 'zod';

import { logger } from '@prairielearn/logger';

import { config } from '../../../lib/config.js';

export interface RollingUsageStore {
  read(scope: string): Promise<number>;
  update(
    scope: string,
    runId: string,
    cumulativeMilliDollars: number,
    occurredAtMilliseconds: number,
  ): Promise<number>;
}

const ROLLING_USAGE_SCRIPT = `
local expired = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
for _, run_id in ipairs(expired) do
  redis.call('HDEL', KEYS[2], run_id)
end
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if ARGV[3] ~= '' and tonumber(ARGV[5]) > tonumber(ARGV[1]) then
  redis.call('ZADD', KEYS[1], ARGV[5], ARGV[3])
  redis.call('HSET', KEYS[2], ARGV[3], ARGV[4])
end
redis.call('EXPIRE', KEYS[1], ARGV[6])
redis.call('EXPIRE', KEYS[2], ARGV[6])
local total = 0
for _, value in ipairs(redis.call('HVALS', KEYS[2])) do
  total = total + tonumber(value)
end
return total
`;

class RedisRollingUsageStore implements RollingUsageStore {
  private getRedis = memoize(async () => {
    if (!config.nonVolatileRedisUrl) throw new Error('nonVolatileRedisUrl must be configured');
    const redis = new Redis(config.nonVolatileRedisUrl);
    redis.on('error', (error) => logger.error('Course-agent usage Redis error', error));
    return redis;
  });

  async read(scope: string) {
    return this.run(scope, '', 0);
  }

  async update(
    scope: string,
    runId: string,
    cumulativeMilliDollars: number,
    occurredAtMilliseconds: number,
  ) {
    return this.run(scope, runId, cumulativeMilliDollars, occurredAtMilliseconds);
  }

  private async run(
    scope: string,
    runId: string,
    cumulativeMilliDollars: number,
    occurredAtMilliseconds = Date.now(),
  ) {
    const redis = await this.getRedis();
    const now = Date.now();
    const windowMilliseconds = config.courseAgentUsageLimits.windowSeconds * 1000;
    const prefix = `${config.cacheKeyPrefix}course-agent-usage:{${scope}}`;
    const result = await redis.eval(
      ROLLING_USAGE_SCRIPT,
      2,
      `${prefix}:runs`,
      `${prefix}:costs`,
      now - windowMilliseconds,
      now,
      runId,
      cumulativeMilliDollars,
      occurredAtMilliseconds,
      config.courseAgentUsageLimits.windowSeconds + 60,
    );
    return z.coerce.number().int().nonnegative().parse(result);
  }
}

const defaultStore = new RedisRollingUsageStore();

function scopes(userId: string, courseId: string) {
  return [
    {
      key: `user:${userId}`,
      limit: config.courseAgentUsageLimits.perUserMilliDollars,
      name: 'user',
    },
    {
      key: `course:${courseId}`,
      limit: config.courseAgentUsageLimits.perCourseMilliDollars,
      name: 'course',
    },
    { key: 'global', limit: config.courseAgentUsageLimits.globalMilliDollars, name: 'global' },
  ];
}

export class CourseAgentUsageLimitError extends Error {}

export async function assertCourseAgentWithinUsageLimits({
  userId,
  courseId,
  store = defaultStore,
}: {
  userId: string;
  courseId: string;
  store?: RollingUsageStore;
}) {
  for (const scope of scopes(userId, courseId)) {
    if (scope.limit === null) continue;
    const usage = await store.read(scope.key);
    if (usage >= scope.limit) {
      throw new CourseAgentUsageLimitError(
        `The course-agent ${scope.name} rolling usage limit has been reached. Try again later.`,
      );
    }
  }
}

export async function recordCourseAgentRollingUsage({
  userId,
  courseId,
  runId,
  cumulativeMilliDollars,
  occurredAtMilliseconds,
  store = defaultStore,
}: {
  userId: string;
  courseId: string;
  runId: string;
  cumulativeMilliDollars: number;
  occurredAtMilliseconds: number;
  store?: RollingUsageStore;
}) {
  await Promise.all(
    scopes(userId, courseId)
      .filter((scope) => scope.limit !== null)
      .map((scope) =>
        store.update(scope.key, runId, cumulativeMilliDollars, occurredAtMilliseconds),
      ),
  );
}
