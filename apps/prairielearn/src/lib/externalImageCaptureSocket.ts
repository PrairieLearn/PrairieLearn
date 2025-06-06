import type { Namespace, Socket } from 'socket.io';

import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';
import { checkSignedToken } from '@prairielearn/signed-token';

import { config } from './config.js';
import * as socketServer from './socket-server.js';

interface StatusMessage {
  variant_id: string;
  file_name: string;
}

let namespace: Namespace;

export function init() {
  namespace = socketServer.io.of('/external-image-capture');
  namespace.on('connection', connection);
}

export function connection(socket: Socket) {
  socket.on('joinExternalImageCapture', async (msg, callback) => {
    if (!ensureProps(msg, ['variant_id', 'variant_token', 'file_name'])) {
      return callback(null);
    }

    if (!checkToken(msg.variant_token, msg.variant_id)) {
      return callback(null);
    }

    socket.join(`variant-${msg.variant_id}-file-${msg.file_name}`);

    callback({
      variant_id: msg.variant_id,
      file_name: msg.file_name,
    } satisfies StatusMessage);
  });
}

function ensureProps(data: Record<string, any>, props: string[]): boolean {
  for (const prop of props) {
    if (!Object.hasOwn(data, prop)) {
      logger.error(`socket.io external image capture connected without ${prop}`);
      Sentry.captureException(
        new Error(`socket.io external image capture connected without property ${prop}`),
      );
      return false;
    }
  }
  return true;
}

/**
 * Emits an external image capture event for the specified variant and file name.
 */
export async function emitExternalImageCapture(variant_id: string, file_name: string) {
  try {
    namespace.to(`variant-${variant_id}-file-${file_name}`).emit('externalImageCapture', {
      variant_id,
      file_name,
    } satisfies StatusMessage);
  } catch (err) {
    logger.error('Error in emitExternalImageCapture', err);
    Sentry.captureException(err);
  }
}

function checkToken(token: string, variantId: string): boolean {
  const data = { variantId };
  const valid = checkSignedToken(token, data, config.secretKey, { maxAge: 24 * 60 * 60 * 1000 });
  if (!valid) {
    logger.error(`Token for variant ${variantId} failed validation.`);
    Sentry.captureException(new Error(`Token for variant ${variantId} failed validation.`));
  }
  return valid;
}
