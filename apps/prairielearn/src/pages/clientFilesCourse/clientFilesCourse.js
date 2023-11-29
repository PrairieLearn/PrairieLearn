// @ts-check
import { selectCourseById } from '../../models/course';
import { selectQuestionById } from '../../models/question';

const asyncHandler = require('express-async-handler');
const path = require('path');
const express = require('express');

const error = require('@prairielearn/error');
const chunks = require('../../lib/chunks');

module.exports = function (options = { publicEndpoint: false }) {
  const router = express.Router({ mergeParams: true });
  router.get(
    '/*',
    asyncHandler(async function (req, res) {
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

      const filename = req.params[0];
      if (!filename) {
        throw error.make(400, 'No filename provided within clientFilesCourse directory', {
          locals: res.locals,
          body: req.body,
        });
      }
      const coursePath = chunks.getRuntimeDirectoryForCourse(res.locals.course);
      await chunks.ensureChunksForCourseAsync(res.locals.course.id, { type: 'clientFilesCourse' });

      const clientFilesDir = path.join(coursePath, 'clientFilesCourse');
      res.sendFile(filename, { root: clientFilesDir });
    }),
  );
  return router;
};
