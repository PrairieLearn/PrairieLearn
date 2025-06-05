import * as sqldb from '@prairielearn/postgres';

import { emitExternalImageCapture } from './externalImageCaptureSocket.js';
import { uploadFile } from './file-store.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Given an uploaded image buffer, uploads the image to the file store,
 * creates a new ExternalImageCapture record in the database, and
 * emits a socket event to notify the client that an image has been captured.
 */
export const createExternalImageCapture = async ({
  variantId,
  answerName,
  userId,
  fileBuffer,
  resLocals,
}: {
  variantId: string;
  answerName: string;
  userId: string;
  fileBuffer: Buffer;
  resLocals: Record<string, any>;
}) => {
  const file_id = await uploadFile({
    display_filename: `${answerName}.png`,
    contents: fileBuffer,
    type: 'image/png',
    assessment_id: resLocals.assessment?.id ?? null,
    assessment_instance_id: null,
    instance_question_id: null,
    user_id: userId,
    authn_user_id: resLocals.authn_user.authn_user_id,
  });

  // Create the ExternalImageCapture record
  await sqldb.queryAsync(sql.insert_new_external_image_capture, {
    variant_id: variantId,
    answer_name: answerName,
    file_id,
  });

  // Emit a socket event to notify the client that the image has been captured.
  await emitExternalImageCapture(variantId, answerName);
};
