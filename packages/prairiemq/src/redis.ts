import { Cluster, Redis } from 'ioredis';

import type { QueueOptions } from './types.js';

export const REDIS_COMMAND_TIMEOUT = 10_000;

export type RedisClient = Redis<'legacy'> | Cluster<'legacy'>;

export function createRedisClient({
  redisUrl,
  redisMode,
  role,
}: {
  redisUrl: string;
  redisMode?: QueueOptions['redisMode'];
  role: 'queue' | 'worker' | 'blocking';
}): RedisClient {
  const redisOptions = {
    // A lost script reply has an ambiguous outcome. PMQ reconciles these
    // operations itself instead of allowing the client to replay them.
    autoResendUnfulfilledCommands: false,
    commandTimeout: REDIS_COMMAND_TIMEOUT,
    socketTimeout: REDIS_COMMAND_TIMEOUT,
    enableOfflineQueue: false,
    maxRetriesPerRequest: role === 'blocking' ? null : role === 'worker' ? 0 : 1,
  };
  if (redisMode !== 'cluster') return new Redis<'legacy'>(redisUrl, redisOptions);

  const url = new URL(redisUrl);
  const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
  const client = new Cluster<'legacy'>([{ host, port: Number(url.port || 6379) }], {
    enableOfflineQueue: false,
    enableReadyCheck: false,
    scaleReads: 'master',
    // Cluster has its own connection-loss replay path in addition to each
    // node's autoResendUnfulfilledCommands option.
    retryDelayOnFailover: 0,
    dnsLookup: (address, callback) => callback(null, address),
    redisOptions: {
      ...redisOptions,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      tls: url.protocol === 'rediss:' ? {} : undefined,
    },
  });
  client.on('+node', (node: Redis) => {
    // ioredis's pool overrides redisOptions.enableOfflineQueue and connects
    // lazily. Start primaries eagerly so PMQ can verify them before writing.
    node.options.enableOfflineQueue = false;
    if (!node.options.readOnly) void node.connect().catch(() => {});
  });
  return client;
}

export function getRedisPrimaries(client: RedisClient): Redis[] {
  return client instanceof Cluster ? client.nodes('master') : [client];
}

export function onRedisConnectionChange(client: RedisClient, callback: () => void): void {
  client.on('close', callback);
  if (!(client instanceof Cluster)) return;

  const tracked = new WeakSet<Redis>();
  const track = (node: Redis) => {
    if (tracked.has(node)) return;
    tracked.add(node);
    node.on('close', callback);
  };
  for (const node of client.nodes()) track(node);
  client.on('+node', (node: Redis) => {
    track(node);
    callback();
  });
  client.on('-node', callback);
}
