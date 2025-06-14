import type { Namespace, Socket } from 'socket.io';

import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import { checkVariantToken } from './checkVariantToken.js';
import type {
  StatusMessage,
  StatusMessageWithFileContent,
} from './externalImageCaptureSocket.types.js';
import * as socketServer from './socket-server.js';

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

    if (!checkVariantToken(msg.variant_token, msg.variant_id)) {
      return callback(null);
    }

    socket.join(`variant-${msg.variant_id}-file-${msg.file_name}`);

    socket.on('externalImageCaptureAck', ({ variant_id, variant_token, file_name }, callback) => {
      namespace.to(`variant-${variant_id}-file-${file_name}`).emit('externalImageCaptureAck', {
        variant_id,
        variant_token,
        file_name,
      } satisfies StatusMessage);

      callback({
        variant_id,
        variant_token,
        file_name,
      } satisfies StatusMessage);
    });

    callback({
      variant_id: msg.variant_id,
      variant_token: msg.variant_token,
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
 * Emits an external image capture event for the specified variant and file.
 */
export async function emitExternalImageCapture({
  variant_id,
  variant_token,
  file_name,
  file_content,
}: {
  variant_id: string;
  variant_token: string;
  file_name: string;
  file_content: string;
}) {
  namespace.to(`variant-${variant_id}-file-${file_name}`).emit('externalImageCapture', {
    variant_id,
    variant_token,
    file_name,
    file_content,
  } satisfies StatusMessageWithFileContent);
}
