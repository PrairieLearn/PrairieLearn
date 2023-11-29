// @ts-check
import { selectCourseById } from '../../models/course';
import { selectQuestionById } from '../../models/question';

const asyncHandler = require('express-async-handler');
const path = require('path');
const express = require('express');

const error = require('@prairielearn/error');
const chunks = require('../../lib/chunks');
const { getQuestionCourse } = require('../../lib/question-variant');

module.exports = function (options = { publicEndpoint: false }) {
  const router = express.Router({ mergeParams: true });
  router.get(
    '/*',
    asyncHandler(async function (req, res) {
      const filename = req.params[0];
      if (!filename) {
        throw error.make(400, 'No filename provided within clientFilesQuestion directory', {
          locals: res.locals,
          body: req.body,
        });
      }

      if (options.publicEndpoint) {
        res.locals.course = await selectCourseById(req.params.course_id);
        res.locals.question = await selectQuestionById(req.params.question_id);

        if (!res.locals.question.shared_publicly) {
          throw error.make(404, 'Not Found');
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
};
