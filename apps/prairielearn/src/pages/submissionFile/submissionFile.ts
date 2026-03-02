import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { isBinaryFile } from 'isbinaryfile';
import mime from 'mime';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { UserSchema } from '../../lib/db-types.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionById } from '../../models/question.js';
import { selectAndAuthzVariant } from '../../models/variant.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const MEDIA_PREFIXES = ['image/', 'audio/', 'video/', 'application/pdf'];
// The video/mp2t mime uses a .ts extension, which conflicts with Typescript files.
// In such cases we fallback to a verification if a file is binary or not
// instead of a blindly trusting the mimetype from the name.
const MEDIA_PREFIX_EXCEPTIONS = ['video/mp2t'];

/**
 * Guesses the mime type for a file based on its name and contents.
 *
 * @param name The file's name
 * @param buffer The file's contents
 * @returns The guessed mime type
 */
export async function guessMimeType(name: string, buffer: Buffer): Promise<string> {
  const mimeType = mime.getType(name);
  if (
    mimeType &&
    MEDIA_PREFIXES.some((p) => mimeType.startsWith(p)) &&
    !MEDIA_PREFIX_EXCEPTIONS.some((p) => mimeType.startsWith(p))
  ) {
    return mimeType;
  }

  const isBinary = await isBinaryFile(buffer);
  return isBinary ? 'application/octet-stream' : 'text/plain';
}

export default function (options = { publicEndpoint: false }) {
  const router = Router({ mergeParams: true });

  router.get(
    '/*',
    asyncHandler(async (req, res) => {
      if (options.publicEndpoint) {
        res.locals.course = await selectCourseById(req.params.course_id);
        res.locals.question = await selectQuestionById(req.params.question_id);
        res.locals.user = UserSchema.parse(res.locals.authn_user);

        if (
          !(res.locals.question.share_publicly || res.locals.question.share_source_publicly) ||
          res.locals.course.id !== res.locals.question.course_id
        ) {
          res.sendStatus(404);
          return;
        }
      }

      const fileName = req.params[0];

      const unsafe_variant_id = await sqldb.queryOptionalRow(
        sql.select_variant_id_by_submission_id,
        { submission_id: req.params.unsafe_submission_id },
        IdSchema,
      );

      if (!unsafe_variant_id) {
        res.sendStatus(404);
        return;
      }

      // This doesn't perform any authorization for the submission itself. We
      // assume that anyone with access to the variant should be able to access
      // its submitted files.
      await selectAndAuthzVariant({
        unsafe_variant_id,
        variant_course: res.locals.course,
        question_id: res.locals.question.id,
        course_instance_id: res.locals.course_instance?.id,
        instance_question_id: res.locals.instance_question?.id,
        authz_data: res.locals.authz_data,
        authn_user: res.locals.authn_user,
        user: res.locals.user,
        is_administrator: res.locals.is_administrator,
        publicQuestionPreview: options.publicEndpoint,
      });

      const contents = await sqldb.queryOptionalRow(
        sql.select_submission_file,
        {
          // We used the submission ID to get and authorize the variant, so the
          // submission ID is now considered safe.
          submission_id: req.params.unsafe_submission_id,
          file_name: fileName,
        },
        z.string().nullable(),
      );

      if (!contents) {
        res.sendStatus(404);
        return;
      }

      const buffer = Buffer.from(contents, 'base64');

      // To avoid having to do expensive content checks on the client, we'll do
      // our best to guess a mime type for the file.
      const mimeType = await guessMimeType(fileName, buffer);
      res.setHeader('Content-Type', mimeType);

      res.status(200).send(buffer);
    }),
  );
  return router;
}
