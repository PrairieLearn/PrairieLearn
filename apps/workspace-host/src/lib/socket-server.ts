import { Emitter } from '@socket.io/redis-emitter';
import { Redis } from 'ioredis';

import { config } from './config.js';

export let io: Emitter;

let client: Redis;

export function init() {
  client = new Redis(config.redisUrl);
  io = new Emitter(client);
}
