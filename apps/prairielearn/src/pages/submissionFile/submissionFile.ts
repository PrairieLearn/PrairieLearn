import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { isBinaryFile } from 'isbinaryfile';
import mime from 'mime';

import * as sqldb from '@prairielearn/postgres';

import { selectCourseById } from '../../models/course.js';
import { selectQuestionById } from '../../models/question.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const MEDIA_PREFIXES = ['image/', 'audio/', 'video/', 'application/pdf'];

/**
 * Guesses the mime type for a file based on its name and contents.
 *
 * @param name The file's name
 * @param buffer The file's contents
 * @returns The guessed mime type
 */
async function guessMimeType(name: string, buffer: Buffer): Promise<string> {
  const mimeType = mime.getType(name);
  if (mimeType && MEDIA_PREFIXES.some((p) => mimeType.startsWith(p))) {
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

        if (
          !(res.locals.question.shared_publicly || res.locals.question.share_source_publicly) ||
          res.locals.course.id !== res.locals.question.course_id
        ) {
          res.sendStatus(404);
          return;
        }
      }

      const submissionId = req.params.submission_id;
      const fileName = req.params[0];

      const fileRes = await sqldb.queryZeroOrOneRowAsync(sql.select_submission_file, {
        question_id: res.locals.question.id,
        instance_question_id: res.locals.instance_question?.id ?? null,
        submission_id: submissionId,
        file_name: fileName,
      });

      if (fileRes.rowCount === 0) {
        res.sendStatus(404);
        return;
      }

      const contents = fileRes.rows[0].contents;
      if (contents == null) {
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
