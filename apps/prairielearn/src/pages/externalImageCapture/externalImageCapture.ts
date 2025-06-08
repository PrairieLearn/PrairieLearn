import * as express from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { emitExternalImageCapture } from '../../lib/externalImageCaptureSocket.js';
import { selectAndAuthzVariant } from '../../models/variant.js';

import { ExternalImageCapture, ExternalImageCaptureSuccess } from './externalImageCapture.html.js';

const router = express.Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.send(
      ExternalImageCapture({
        fileName: req.query.file_name,
        resLocals: res.locals,
      }),
    );
  }),
);

// Handles image uploading from the external image capture page.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const variantId = req.params.variant_id as string;
    const fileName = req.query.file_name as string;

    const variant = await selectAndAuthzVariant({
      unsafe_variant_id: variantId,
      variant_course: res.locals.course,
      question_id: res.locals.question.id,
      course_instance_id: res.locals?.course_instance?.id,
      instance_question_id: res.locals.instance_question?.id,
      authz_data: res.locals.authz_data,
      authn_user: res.locals.authn_user,
      user: res.locals.user,
      is_administrator: res.locals.is_administrator,
      publicQuestionPreview: res.locals.public_question_preview,
    });

    if (!variant) {
      throw new HttpStatusError(404, 'Variant not found');
    }

    if (!variant.open) {
      throw new HttpStatusError(403, 'This variant is not open');
    }

    if (!req.file?.buffer) {
      throw new HttpStatusError(400, 'No file uploaded');
    }

    const fileBase64 = req.file.buffer.toString('base64');

    if (fileBase64.length > 10 * 1024 * 1024) {
      throw new HttpStatusError(400, 'File size exceeds the limit of 10MB');
    }

    // Emit a socket event to notify the client that the image has been captured.
    await emitExternalImageCapture({
      variant_id: variantId,
      file_name: fileName,
      file_content: req.file.buffer.toString('base64'),
    });

    res.send(
      ExternalImageCaptureSuccess({
        resLocals: res.locals,
      }),
    );
  }),
);

export default router;
