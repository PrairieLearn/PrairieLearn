import * as express from 'express';
import asyncHandler from 'express-async-handler';

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
  '/answer_name/:answer_name',
  asyncHandler(async (req, res) => {
    res.send(
      ExternalImageCapture({
        resLocals: res.locals,
      }),
    );
  }),
);

router.get(
  '/answer_name/:answer_name/submitted_image',
  asyncHandler(async (req, res) => {
    const variantId = req.params.variant_id;
    const answer_name = req.params.answer_name;

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
      res.status(404).send('Variant not found');
      return;
    }

    const externalImageCapture = await queryOptionalRow(
      sql.select_external_image_capture_by_variant_and_element,
      {
        variant_id: parseInt(variant.id),
        answer_name,
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
        uploadDate: externalImageCapture.created_at,
      });
    } else {
      res.status(404).send();
    }
  }),
);

router.post(
  '/answer_name/:answer_name',
  asyncHandler(async (req, res) => {
    // Validate that the user has access to the variant
    const variantId = req.params.variant_id;
    const answer_name = req.params.answer_name;
    const userId = res.locals.authn_user.user_id;

    if (!variantId || !answer_name || !userId) {
      res.status(400).send('Missing required parameters');
      return;
    }

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
      res.status(404).send('Variant not found');
      return;
    }

    if (!variant.open) {
      res.status(403).send('Forbidden: This variant is not open');
      return;
    }

    if (!req.file?.buffer) {
      res.status(400).send('No file uploaded');
      return;
    }

    createExternalImageCapture({
      variantId,
      answerName: answer_name,
      userId,
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

export default router;
