import { Redis } from 'ioredis';
import memoize from 'p-memoize';
import { createResumableStreamContext } from 'resumable-stream/ioredis';

import { config } from '../../../lib/config.js';

const getCourseAgentRedisClients = memoize(async () => {
  if (!config.redisUrl) throw new Error('Redis URL is not configured');

  const pub = new Redis(config.redisUrl, { lazyConnect: true });
  const sub = new Redis(config.redisUrl, { lazyConnect: true });

  await Promise.all([pub.connect(), sub.connect()]);

  return { pub, sub };
});

export async function getCourseAgentStreamContext() {
  const clients = await getCourseAgentRedisClients();

  return createResumableStreamContext({
    waitUntil: null,
    subscriber: clients.sub,
    publisher: clients.pub,
  });
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
