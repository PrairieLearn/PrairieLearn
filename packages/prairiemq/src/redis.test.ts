import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Queue } from './queue.js';
import type { PrairieMQRedis } from './scripts.js';
import { Worker } from './worker.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379/';

describe('Redis compatibility', () => {
  const queues: Queue[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const queue of queues.splice(0)) {
      await queue.obliterate();
      await queue.close();
    }
  });

  async function queueWithInfo(info: string) {
    const queue = new Queue(`test-${randomUUID()}`, { redisUrl });
    queues.push(queue);
    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    if (client.status !== 'ready') await once(client, 'ready');
    return { queue, info: vi.spyOn(client, 'info').mockResolvedValue(info) };
  }

  it.each([
    '# Server\r\nredis_version:7.2\r\n',
    '# Server\r\nvalkey_version:7.2.6\r\n',
    '# Server\r\nredis_version:6.2.0\r\n',
  ])('accepts supported metadata from unsectioned INFO: %j', async (metadata) => {
    const { queue, info } = await queueWithInfo(metadata);

    await queue.waitUntilReady();

    expect(info).toHaveBeenCalledWith();
    await expect(queue.add('job', {})).resolves.toMatchObject({ name: 'job' });
  });

  it.each([
    ['# Server\r\nredis_version:6.0\r\n', 'connected server is 6.0.0'],
    ['# Server\r\nserver_name:valkey\r\n', 'could not determine the Redis server version'],
    ['# Server\r\nredis_version:7.2garbage\r\n', 'could not determine the Redis server version'],
  ])('rejects unsupported or missing version metadata: %j', async (metadata, error) => {
    const { queue } = await queueWithInfo(metadata);

    await expect(queue.add('job', {})).rejects.toThrow(error);
  });
});

describe('Redis connection validation', () => {
  it.each([
    [{ redisMode: 'redis' }, 'redisMode must be "standalone" or "cluster"'],
    [{ redisMode: null }, 'redisMode must be "standalone" or "cluster"'],
    [
      { redisMode: 'cluster', redisUrl: 'redis://localhost:6379/1' },
      'Cluster connections require Redis database zero',
    ],
  ])('rejects invalid connection options: %j', (options, error) => {
    const invalidOptions = { redisUrl, ...options } as never;

    expect(() => new Queue('test', invalidOptions)).toThrow(error);
    expect(() => new Worker('test', async () => undefined, invalidOptions)).toThrow(error);
  });
});
