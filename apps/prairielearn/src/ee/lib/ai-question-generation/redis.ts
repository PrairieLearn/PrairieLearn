import { Redis } from 'ioredis';
import memoize from 'p-memoize';
import {
  type ResumableStreamContext,
  createResumableStreamContext,
} from 'resumable-stream/ioredis';

import { config } from '../../../lib/config.js';

const getAiQuestionGenerationRedisClient = memoize(async () => {
  if (!config.redisUrl) throw new Error('Redis URL is not configured');

  // See note in `socket-server.ts` about the configuration here.
  const pub = new Redis(config.redisUrl, { lazyConnect: true });
  const sub = new Redis(config.redisUrl, { lazyConnect: true });

  await Promise.all([pub.connect(), sub.connect()]);

  return { pub, sub };
});

export async function getAiQuestionGenerationStreamContext(): Promise<ResumableStreamContext> {
  const clients = await getAiQuestionGenerationRedisClient();

  return createResumableStreamContext({
    waitUntil: null,
    subscriber: clients.sub,
    publisher: clients.pub,
  });
}
