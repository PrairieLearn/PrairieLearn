import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { ensureChunksForCourseAsync, getRuntimeDirectoryForCourse } from '../../lib/chunks.js';
import { sendCourseFile } from '../../lib/express/send-file.js';
import { getQuestionCourse } from '../../lib/question-variant.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionById } from '../../models/question.js';

export default function (options = { publicEndpoint: false }) {
  const router = Router({ mergeParams: true });
  router.get(
    '/*',
    asyncHandler(async function (req, res) {
      const filename = req.params[0];
      if (!filename) {
        throw new HttpStatusError(400, 'No filename provided within clientFilesQuestion directory');
      }

      if (options.publicEndpoint) {
        res.locals.course = await selectCourseById(req.params.course_id);
        res.locals.question = await selectQuestionById(req.params.question_id);

        if (
          !(res.locals.question.share_publicly || res.locals.question.share_source_publicly) ||
          res.locals.course.id !== res.locals.question.course_id
        ) {
          throw new HttpStatusError(404, 'Not Found');
        }
      }

      const question_course = await getQuestionCourse(res.locals.question, res.locals.course);
      const coursePath = getRuntimeDirectoryForCourse(question_course);

      await ensureChunksForCourseAsync(question_course.id, {
        type: 'question',
        questionId: res.locals.question.id,
      });

      await sendCourseFile(res, {
        coursePath,
        directory: path.join('questions', res.locals.question.directory, 'clientFilesQuestion'),
        filename,
      });
    }),
  );
  return router;
}
