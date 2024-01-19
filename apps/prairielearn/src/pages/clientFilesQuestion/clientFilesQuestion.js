// @ts-check
const asyncHandler = require('express-async-handler');
const path = require('path');
const express = require('express');

const error = require('@prairielearn/error');
const chunks = require('../../lib/chunks');
const { getQuestionCourse } = require('../../lib/question-variant');
const { selectCourseById } = require('../../models/course');
const { selectQuestionById } = require('../../models/question');

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

        if (
          !res.locals.question.shared_publicly ||
          res.locals.course.id !== res.locals.question.course_id
        ) {
          throw error.make(404, 'Not Found');
        }
      }

      const question_course = await getQuestionCourse(res.locals.question, res.locals.course);
      if (question_course.path == null) {
        // This is unlikely to happen in real scenarios, but it's tested because
        // path is required by the following function call.
        throw error.make(404, 'Not Found');
      }
      const coursePath = chunks.getRuntimeDirectoryForCourse({
        id: question_course.id,
        path: question_course.path,
      });

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
