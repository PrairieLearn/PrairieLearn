import { type JsonToSseTransformStream } from 'ai';
import { Redis } from 'ioredis';
import memoize from 'p-memoize';
import {
  type ResumableStreamContext,
  createResumableStreamContext,
} from 'resumable-stream/ioredis';

import { config } from '../../../lib/config.js';

const getAiGradingRedisClient = memoize(async () => {
  if (!config.redisUrl) throw new Error('Redis URL is not configured');

  const pub = new Redis(config.redisUrl, { lazyConnect: true });
  const sub = new Redis(config.redisUrl, { lazyConnect: true });

  await Promise.all([pub.connect(), sub.connect()]);

  return { pub, sub };
});

export async function getAiGradingStreamContext(): Promise<ResumableStreamContext> {
  const clients = await getAiGradingRedisClient();

  return createResumableStreamContext({
    waitUntil: null,
    subscriber: clients.sub,
    publisher: clients.pub,
  });
}

/**
 * In-memory map of SSE streams keyed by message ID. The route handler creates
 * the stream and registers it here BEFORE calling continueWorkflow. The workflow's
 * takeStep then retrieves the pre-created stream to write agent output into.
 *
 * For crash recovery (where no pre-created stream exists), takeStep creates
 * a new stream and registers it with Redis directly.
 */
const activeSseStreams = new Map<string, JsonToSseTransformStream>();

export function registerSseStream(messageId: string, stream: JsonToSseTransformStream): void {
  activeSseStreams.set(messageId, stream);
}

export function takeSseStream(messageId: string): JsonToSseTransformStream | null {
  const stream = activeSseStreams.get(messageId) ?? null;
  if (stream) {
    activeSseStreams.delete(messageId);
  }
  return stream;
}
