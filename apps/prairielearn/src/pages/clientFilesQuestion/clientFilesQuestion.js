// @ts-check
import asyncHandler from 'express-async-handler';
import * as path from 'node:path';
import { Router } from 'express';

import * as chunks from '../../lib/chunks.js';
import { getQuestionCourse } from '../../lib/question-variant.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionById } from '../../models/question.js';
import { HttpStatusError } from '@prairielearn/error';

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
          !res.locals.question.shared_publicly ||
          res.locals.course.id !== res.locals.question.course_id
        ) {
          throw new HttpStatusError(404, 'Not Found');
        }
      }

      const question_course = await getQuestionCourse(res.locals.question, res.locals.course);
      const coursePath = chunks.getRuntimeDirectoryForCourse(question_course);

      await chunks.ensureChunksForCourseAsync(question_course.id, {
        type: 'question',
        questionId: res.locals.question.id,
      });

      const clientFilesDir = path.join(
        coursePath,
        'questions',
        res.locals.question.directory,
        'clientFilesQuestion',
      );
      res.sendFile(filename, { root: clientFilesDir });
    }),
  );
  return router;
}
