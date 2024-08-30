import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { getRuntimeDirectoryForCourse, ensureChunksForCourseAsync } from '../../lib/chunks.js';
import { config } from '../../lib/config.js';
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
          !res.locals.question.shared_publicly ||
          res.locals.course.id !== res.locals.question.course_id
        ) {
          throw new HttpStatusError(404, 'Not Found');
        }
      }

      // If the route includes a `cachebuster` param, we'll set the `immutable`
      // and `maxAge` options on the `Cache-Control` header. This router is
      // mounted twice - one with the cachebuster in the URL, and once without it
      // for backwards compatibility. See `server.js` for more details.
      //
      // As with `/assets/`, we assume that question files are likely to change
      // when running in dev mode, so we skip caching entirely in that case.
      const isCached = !!req.params.cachebuster && !config.devMode;
      const sendFileOptions = {
        immutable: isCached,
        maxAge: isCached ? '31536000s' : 0,
      };

      if (isCached) {
        // `middlewares/cors.js` disables caching for all routes by default.
        // We need to remove this header so that `res.sendFile` can set it
        // correctly.
        res.removeHeader('Cache-Control');
      }

      const question_course = await getQuestionCourse(res.locals.question, res.locals.course);
      const coursePath = getRuntimeDirectoryForCourse(question_course);

      await ensureChunksForCourseAsync(question_course.id, {
        type: 'question',
        questionId: res.locals.question.id,
      });

      const clientFilesDir = path.join(
        coursePath,
        'questions',
        res.locals.question.directory,
        'clientFilesQuestion',
      );
      res.sendFile(filename, { root: clientFilesDir, ...sendFileOptions });
    }),
  );
  return router;
}
