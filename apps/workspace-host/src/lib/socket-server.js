// @ts-check
import { Emitter } from '@socket.io/redis-emitter';
import { Redis } from 'ioredis';

import { config } from './config';

/** @type {Emitter} */
export let io;

/** @type {Redis} */
let client;

export function init() {
  client = new Redis(config.redisUrl);
  io = new Emitter(client);
}

export async function close() {
  await client?.quit();
}
