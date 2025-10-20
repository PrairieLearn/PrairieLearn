import { Redis } from 'ioredis';
import {
  type ResumableStreamContext,
  createResumableStreamContext,
} from 'resumable-stream/ioredis';

import { config } from '../../../lib/config.js';

interface AiQuestionGenerationClients {
  redis: Redis;
  pub: Redis;
  sub: Redis;
}

const clients: AiQuestionGenerationClients | null = null;

export async function getAiQuestionGenerationRedisClient() {
  if (clients) return clients;

  if (!config.redisUrl) throw new Error('Redis URL is not configured');

  const redis = new Redis(config.redisUrl);
  const pub = new Redis(config.redisUrl);
  const sub = new Redis(config.redisUrl);

  return { redis, pub, sub };
}

export async function getAiQuestionGenerationStreamContext(): Promise<ResumableStreamContext> {
  const clients = await getAiQuestionGenerationRedisClient();

  return createResumableStreamContext({
    waitUntil: null,
    subscriber: clients.sub,
    publisher: clients.pub,
  });
}
