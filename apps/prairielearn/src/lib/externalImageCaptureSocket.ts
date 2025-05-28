import type { Namespace, Socket } from 'socket.io';
import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';
import { checkSignedToken } from '@prairielearn/signed-token';

import { config } from './config.js';
import * as socketServer from './socket-server.js';

let namespace: Namespace;

const sql = sqldb.loadSqlEquiv(import.meta.url);

export function init() {
    namespace = socketServer.io.of('/external-image-capture');
    namespace.on('connection', connection); 
}

export function connection(socket: Socket) {
    socket.on('joinExternalImageCapture', async (msg, callback) => {
        console.log('Msg', msg);
        console.log('Callback', callback);

        // TODO: Implement token authentication
        if (!ensureProps(msg, ['variant_id', 'variant_token', 'answer_name'])) {
            return callback(null);
        }

        if (!checkToken(msg.variant_token, msg.variant_id)) {
            return callback(null);
        }

        socket.join(`variant-${msg.variant_id}-answer-${msg.answer_name}`);

        const existsImageCapture = await sqldb.queryOptionalRow(
            sql.select_exists_external_image_capture,
            {
                variant_id: parseInt(msg.variant_id),
                answer_name: msg.answer_name,
            },
            z.boolean(),
        );

        callback({
            variant_id: msg.variant_id,
            answer_name: msg.answer_name,
            image_uploaded: existsImageCapture ?? false,
        });
    })
}

function ensureProps(data: Record<string, any>, props: string[]): boolean {
  for (const prop of props) {
    if (!Object.hasOwn(data, prop)) {
      logger.error(`socket.io external image capture connected without ${prop}`);
      Sentry.captureException(
        new Error(`socket.io external external image capture connected without property ${prop}`),
      );
      return false;
    }
  }
  return true;
}

export async function imageUploaded(
    variant_id: string,
    answer_name: string
) {
    try {
        namespace.to(`variant-${variant_id}-answer-${answer_name}`).emit('imageUploaded', {
            variant_id,
            answer_name,
            image_uploaded: true,
        });
    } catch (err) {
        logger.error('Error in imageUploaded', err);
        Sentry.captureException(err);
    }

};

// TODO: Create a separate function for this -- this is shared
function checkToken(token: string, variantId: string): boolean {
  const data = { variantId };
  const valid = checkSignedToken(token, data, config.secretKey, { maxAge: 24 * 60 * 60 * 1000 });
  if (!valid) {
    logger.error(`Token for variant ${variantId} failed validation.`);
    Sentry.captureException(new Error(`Token for variant ${variantId} failed validation.`));
  }
  return valid;
}
