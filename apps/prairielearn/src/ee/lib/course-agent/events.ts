import { EventEmitter } from 'node:events';

import { Redis } from 'ioredis';

import { config } from '../../../lib/config.js';

const channel = 'course-agent:changed';
const listeners = new EventEmitter();
listeners.setMaxListeners(0);
let clients: Promise<{ pub: Redis; sub: Redis }> | undefined;

function connect() {
  return (clients ??= (async () => {
    if (!config.redisUrl) throw new Error('Redis is required for course-agent events.');
    const pub = new Redis<'legacy'>(config.redisUrl, { lazyConnect: true });
    const sub = new Redis<'legacy'>(config.redisUrl, { lazyConnect: true });
    try {
      await Promise.all([pub.connect(), sub.connect()]);
    } catch (error) {
      pub.disconnect();
      sub.disconnect();
      throw error;
    }
    sub.on('message', (_channel, id) => listeners.emit(id));
    await sub.subscribe(channel);
    return { pub, sub };
  })().catch((error) => {
    clients = undefined;
    throw error;
  }));
}
export async function notify(id: string) {
  await (await connect()).pub.publish(channel, id);
}
export async function subscribe(id: string, callback: () => void) {
  await connect();
  listeners.on(id, callback);
  return () => {
    listeners.off(id, callback);
  };
}

export async function closeEvents() {
  if (!clients) return;
  const active = await clients;
  clients = undefined;
  active.pub.disconnect();
  active.sub.disconnect();
  listeners.removeAllListeners();
}
