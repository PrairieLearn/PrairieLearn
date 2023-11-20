// @ts-check
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { logger } from '@prairielearn/logger';
import * as path from 'path';
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const { config } = require('./config');

/**
 * @param {Redis} client
 * @param {string} type
 */
function attachEventListeners(client, type) {
  client.on('error', (err) => {
    logger.error(`redis client event for ${type}: error`, err);
  });
  client.on('connect', () => {
    logger.verbose(`redis client event for ${type}: connect`);
  });
  client.on('ready', () => {
    logger.verbose(`redis client event for ${type}: ready`);
  });
  client.on('reconnecting', (reconnectTimeMilliseconds) => {
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

export let io, pub, sub;

export async function init(server) {
  debug('init(): creating socket server');
  io = new Server(server);
  if (config.redisUrl) {
    // Use redis to mirror broadcasts via all servers
    debug('init(): initializing redis pub/sub clients');
    pub = new Redis(config.redisUrl);
    sub = new Redis(config.redisUrl);

    attachEventListeners(module.exports.pub, 'pub');
    attachEventListeners(module.exports.sub, 'sub');

    debug('init(): initializing redis socket adapter');
    module.exports.io.adapter(createAdapter(module.exports.pub, module.exports.sub));
  }
}

export async function close() {
  await pub?.quit();
  await sub?.quit();

  // Note that we don't use `io.close()` here, as that actually tries to close
  // the underlying HTTP server. In our desired shutdown sequence, we first
  // close the HTTP server and then later disconnect all sockets. There's some
  // discussion about this behavior here:
  // https://github.com/socketio/socket.io/discussions/4002#discussioncomment-4080748
  //
  // Note the use of `io.local`, which prevents the server from attempting to
  // broadcast the disconnect to other servers via Redis.
  io.local.disconnectSockets(true);
}
