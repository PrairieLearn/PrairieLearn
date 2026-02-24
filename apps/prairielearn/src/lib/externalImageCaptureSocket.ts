import assert from 'node:assert';

import type { Namespace, Socket } from 'socket.io';

import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import { checkVariantToken } from './checkVariantToken.js';
import { ensureProps } from './ensureProps.js';
import type {
  StatusMessage,
  StatusMessageWithFileContent,
} from './externalImageCaptureSocket.types.js';
import * as socketServer from './socket-server.js';

let namespace: Namespace;

export function init() {
  assert(socketServer.io);
  namespace = socketServer.io.of('/external-image-capture');
  namespace.on('connection', connection);
}

function connection(socket: Socket) {
  socket.on('joinExternalImageCapture', (msg: StatusMessage, callback) => {
    if (
      !ensureProps({
        data: msg,
        props: ['variant_id', 'variant_token', 'file_name'],
        socketName: 'external image capture',
      })
    ) {
      return callback(null);
    }

    if (!validateMessageContent(msg)) {
      return callback(null);
    }

    void socket.join(`variant-${msg.variant_id}-file-${msg.file_name}`);

    socket.on('externalImageCaptureAck', (msg: StatusMessage, callback) => {
      if (
        !ensureProps({
          data: msg,
          props: ['variant_id', 'variant_token', 'file_name'],
          socketName: 'external image capture',
        })
      ) {
        return callback(null);
      }

      if (!validateMessageContent(msg)) {
        return callback(null);
      }

      namespace
        .to(`variant-${msg.variant_id}-file-${msg.file_name}`)
        .emit('externalImageCaptureAck', msg);

      callback(msg);
    });

    callback(msg);
  });
}

/**
 * Emits an external image capture event for the specified variant and file.
 */
export function emitExternalImageCapture({
  variant_id,
  file_name,
  file_content,
}: {
  variant_id: string;
  file_name: string;
  file_content: string;
}) {
  namespace.to(`variant-${variant_id}-file-${file_name}`).emit('externalImageCapture', {
    variant_id,
    file_name,
    file_content,
  } satisfies StatusMessageWithFileContent);
}

/**
 * Ensures that the message variant token, file name, and variant ID are valid.
 * Prevents cross-site scripting and directory traversal attacks.
 *
 * @param msg - The message to validate.
 * @param msg.variant_id - The variant ID.
 * @param msg.variant_token - The variant token.
 * @param msg.file_name - The file name.
 *
 * @returns true if the message is valid, false otherwise.
 */
function validateMessageContent({ variant_id, variant_token, file_name }: StatusMessage): boolean {
  if (!checkVariantToken(variant_token, variant_id)) {
    logger.error('Invalid variant_token provided for external image capture');
    Sentry.captureException(new Error('Invalid variant_token provided for external image capture'));
    return false;
  }

  // file_name must be a valid file name with no directory traversal: it must not contain
  // any path separators (e.g., / or \) and must have an extension.
  if (!/^(?!.*[\\/])[^\\/]+\.[^\\/]+$/.test(file_name)) {
    logger.error('Invalid file_name provided for external image capture');
    Sentry.captureException(new Error('Invalid file_name provided for external image capture'));
    return false;
  }

  // variant_id must be a positive integer.
  if (!/^\d+$/.test(variant_id)) {
    logger.error('Invalid variant_id provided for external image capture');
    Sentry.captureException(new Error('Invalid variant_id provided for external image capture'));
    return false;
  }

  return true;
}
