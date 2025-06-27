import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { generateSignedToken } from '@prairielearn/signed-token';

import { config } from '../../lib/config.js';
import { emitExternalImageCapture } from '../../lib/externalImageCaptureSocket.js';
import { selectCourseById } from '../../models/course.js';
import { selectAndAuthzVariant } from '../../models/variant.js';

import { ExternalImageCapture } from './externalImageCapture.html.js';

export default function (options = { publicQuestionPreview: false }) {
  const router = Router({ mergeParams: true });

  router.use(
    '/',
    asyncHandler(async (req, res, next) => {
      const variant = await selectAndAuthzVariant({
        unsafe_variant_id: req.params.variant_id,
        variant_course: res.locals.course ?? (await selectCourseById(req.params.course_id)),
        question_id: res.locals.question?.id ?? req.params.question_id,
        course_instance_id: res.locals?.course_instance?.id,
        instance_question_id: res.locals.instance_question?.id,
        authz_data: res.locals.authz_data,
        authn_user: res.locals.authn_user,
        user: res.locals.user,
        is_administrator: res.locals.is_administrator,
        publicQuestionPreview: options.publicQuestionPreview,
      });

      if (!variant) {
        throw new HttpStatusError(404, 'Variant not found');
      }

      if (!variant.open) {
        throw new HttpStatusError(403, 'This variant is not open');
      }

      // Used for "auth" to connect to the external image capture socket.
      // ID is coerced to a string so that it matches what we get back from the client.
      res.locals.variantToken = generateSignedToken(
        { variantId: variant.id.toString() },
        config.secretKey,
      );

      next();
    }),
  );

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      if (!req.query.file_name) {
        throw new HttpStatusError(400, 'file_name query parameter is required');
      }
      res.send(
        ExternalImageCapture({
          variantId: req.params.variant_id,
          fileName: req.query.file_name as string,
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
      const fileName = req.body.file_name as string | undefined;

      if (!fileName) {
        throw new HttpStatusError(400, 'file_name is required');
      }

      if (!req.file?.buffer) {
        throw new HttpStatusError(400, 'No file uploaded');
      }

      if (req.file.buffer.length > 10 * 1024 * 1024) {
        throw new HttpStatusError(400, 'File size exceeds the limit of 10MB');
      }

      // Emit a socket event to notify the client that the image has been captured.
      emitExternalImageCapture({
        variant_id: variantId,
        file_name: fileName,
        file_content: req.file.buffer.toString('base64'),
      });

      res.status(200).send('Success');
    }),
  );

  return router;
}
