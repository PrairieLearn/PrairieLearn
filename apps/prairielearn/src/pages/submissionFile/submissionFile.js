// @ts-check
import { selectCourseById } from '../../models/course';
import { selectQuestionById } from '../../models/question';
const express = require('express');
const asyncHandler = require('express-async-handler');
const error = require('@prairielearn/error');
const { isBinaryFile } = require('isbinaryfile');
const mime = require('mime');
const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

const MEDIA_PREFIXES = ['image/', 'audio/', 'video/', 'application/pdf'];

/**
 * Guesses the mime type for a file based on its name and contents.
 *
 * @param {string} name The file's name
 * @param {Buffer} buffer The file's contents
 * @returns {Promise<string>} The guessed mime type
 */
async function guessMimeType(name, buffer) {
  const mimeType = mime.getType(name);
  if (mimeType && MEDIA_PREFIXES.some((p) => mimeType.startsWith(p))) {
    return mimeType;
  }

  const isBinary = await isBinaryFile(buffer);
  return isBinary ? 'application/octet-stream' : 'text/plain';
}

module.exports = function (options = { publicEndpoint: false }) {
  const router = express.Router({ mergeParams: true });

  router.get(
    '/*',
    asyncHandler(async (req, res) => {
      console.log('submission file endpoint hit');
      if (options.publicEndpoint) {
        res.locals.course = await selectCourseById(req.params.course_id);
        res.locals.question = await selectQuestionById(req.params.question_id);

        if (
          !res.locals.question.shared_publicly ||
          res.locals.course.id !== res.locals.question.course_id
        ) {
          throw error.make(404, 'Not Found');
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
};
