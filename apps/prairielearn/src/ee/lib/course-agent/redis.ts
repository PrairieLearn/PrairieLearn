import { Redis } from 'ioredis';
import memoize from 'p-memoize';
import {
  type ResumableStreamContext,
  createResumableStreamContext,
} from 'resumable-stream/ioredis';

import { config } from '../../../lib/config.js';

const getRedisClients = memoize(async () => {
  if (!config.redisUrl) throw new Error('Redis URL is not configured');
  const publisher = new Redis(config.redisUrl, { lazyConnect: true });
  const subscriber = new Redis(config.redisUrl, { lazyConnect: true });
  await Promise.all([publisher.connect(), subscriber.connect()]);
  return { publisher, subscriber };
});

export async function getCourseAgentStreamContext(): Promise<ResumableStreamContext> {
  const { publisher, subscriber } = await getRedisClients();
  return createResumableStreamContext({ waitUntil: null, publisher, subscriber });
}

export function getCourseAgentStreamId({
  courseId,
  userId,
  runId,
}: {
  courseId: string;
  userId: string;
  runId: string;
}) {
  return `course-agent:${courseId}:${userId}:${runId}`;
}
