import type http from 'http';
import assert from 'node:assert';

import { createAdapter } from '@socket.io/redis-adapter';
import debugfn from 'debug';
import { Redis } from 'ioredis';
import { Server } from 'socket.io';
import { Adapter } from 'socket.io-adapter';

import { logger } from '@prairielearn/logger';

import { config } from './config.js';

const debug = debugfn('prairielearn:socket-server');

function attachEventListeners(client: Redis, type: string) {
  client.on('error', (err) => {
    logger.error(`redis client event for ${type}: error`, err);
  });
  client.on('connect', () => {
    logger.verbose(`redis client event for ${type}: connect`);
  });
  client.on('ready', () => {
    logger.verbose(`redis client event for ${type}: ready`);
  });
  client.on('reconnecting', (reconnectTimeMilliseconds: number) => {
    logger.verbose(
      `redis client event for ${type}: reconnecting in ${reconnectTimeMilliseconds} milliseconds`,
    );
  });
  client.on('close', () => {
    logger.verbose(`redis client event for ${type}: close`);
  });
  client.on('end', () => {
    logger.verbose(`redis client event for ${type}: end`);
  });
  client.on('wait', () => {
    logger.verbose(`redis client event for ${type}: wait`);
  });
  client.on('select', () => {
    logger.verbose(`redis client event for ${type}: select`);
  });
}

export let io: Server | undefined;

let pub: Redis | undefined;
let sub: Redis | undefined;

export function init(server: http.Server) {
  debug('init(): creating socket server');
  io = new Server(server);
  if (config.redisUrl) {
    // Use redis to mirror broadcasts via all servers.
    // We set `disableClientInfo: true` to work around this bug:
    // https://github.com/redis/ioredis/issues/2037
    pub = new Redis(config.redisUrl, { disableClientInfo: true });
    sub = new Redis(config.redisUrl, { disableClientInfo: true });

    attachEventListeners(pub, 'pub');
    attachEventListeners(sub, 'sub');

    debug('init(): initializing redis socket adapter');
    io.adapter(createAdapter(pub, sub));
  }
}

export async function close() {
  assert(io, 'io is required');
  // Note that we don't use `io.close()` here, as that actually tries to close
  // the underlying HTTP server. In our desired shutdown sequence, we first
  // close the HTTP server and then later disconnect all sockets. There's some
  // discussion about this behavior here:
  // https://github.com/socketio/socket.io/discussions/4002#discussioncomment-4080748
  //
  // The following sequence is based on what `io.close()` would do internally.
  //
  // Note the use of `io.local`, which prevents the server from attempting to
  // broadcast the disconnect to other servers via Redis.
  //
  // Note that we pass `true` to `disconnectSockets()`. This should ensure that
  // clients try to reconnect, and that will be routed to a different server.
  io.local.disconnectSockets(true);

  // Collect all namespace adapters. We do this before replacing the adapter
  // because we can't get references to the original adapters after that.
  const adapters = [...io._nsps.values()].map((nsp) => nsp.adapter);

  // Replace the adapter with an in-memory adapter to prevent further broadcasts
  // in case anything is still producing events.
  io.adapter(Adapter);

  // Close the adapters. This will remove the pub/sub subscriptions to ensure we
  // don't receive any more messages from Redis.
  // The type signature of `close()` is `Promise<void> | void`, so we need to disable the rule about the unneeded `Promise.all`.
  // eslint-disable-next-line @typescript-eslint/await-thenable
  await Promise.all(adapters.map((adapter) => adapter.close()));

  // Close any remaining client connections.
  io.engine.close();

  // Shut down the Redis clients. If this fails, ignore it and proceed.
  await pub?.quit().catch(() => {});
  await sub?.quit().catch(() => {});
}
