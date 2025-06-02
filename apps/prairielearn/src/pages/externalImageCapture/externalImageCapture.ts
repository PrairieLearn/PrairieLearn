import * as express from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { queryOptionalRow } from '@prairielearn/postgres';

import { ExternalImageCaptureSchema } from '../../lib/db-types.js';
import { createExternalImageCapture } from '../../lib/externalImageCapture.js';
import { getFile } from '../../lib/file-store.js';
import { selectAndAuthzVariant } from '../../models/variant.js';

import { ExternalImageCapture, ExternalImageCaptureSuccess } from './externalImageCapture.html.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const router = express.Router({
  mergeParams: true,
});

router.get(
  '/answer/:answer_name',
  asyncHandler(async (req, res) => {
    res.send(
      ExternalImageCapture({
        resLocals: res.locals,
      }),
    );
  }),
);

// Handles image uploading from the external image capture page.
router.post(
  '/answer/:answer_name',
  asyncHandler(async (req, res) => {
    const variantId = req.params.variant_id as string;
    const answerName = req.params.answer_name as string;

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

    createExternalImageCapture({
      variantId,
      answerName,
      userId: res.locals.authn_user.user_id,
      fileBuffer: req.file.buffer,
      resLocals: res.locals,
    });

    res.send(
      ExternalImageCaptureSuccess({
        resLocals: res.locals,
      }),
    );
  }),
);

// Handles fetching the uploaded, externally-captured image for a specific answer.
router.get(
  '/answer/:answer_name/uploaded_image',
  asyncHandler(async (req, res) => {
    const variant = await selectAndAuthzVariant({
      unsafe_variant_id: req.params.variant_id,
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

    const externalImageCapture = await queryOptionalRow(
      sql.select_external_image_capture_by_variant_id_and_answer_name,
      {
        variant_id: parseInt(variant.id),
        answer_name: req.params.answer_name,
      },
      ExternalImageCaptureSchema,
    );

    if (externalImageCapture) {
      const { contents, file } = await getFile(externalImageCapture.file_id);
      const base64_contents = contents.toString('base64');
      res.json({
        filename: file.display_filename,
        type: file.type,
        data: base64_contents,
        uploadDate: externalImageCapture.updated_at,
      });
    } else {
      throw new HttpStatusError(404, 'No image submitted for this answer');
    }
  }),
);

export default router;
