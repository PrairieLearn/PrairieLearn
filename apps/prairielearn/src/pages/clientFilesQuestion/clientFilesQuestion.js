// @ts-check
import { selectCourseById } from '../../models/course';
import { selectQuestionById } from '../../models/question';

const asyncHandler = require('express-async-handler');
const path = require('path');
const express = require('express');
const router = express.Router({ mergeParams: true });

const error = require('@prairielearn/error');
const chunks = require('../../lib/chunks');
const { getQuestionCourse } = require('../../lib/question');

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
    res.locals.course = selectCourseById(req.params.course_id);
    res.locals.question = selectQuestionById(req.params.question_id);

    const question_course = await getQuestionCourse(res.locals.question, res.locals.course);
    const coursePath = chunks.getRuntimeDirectoryForCourse(question_course);

    /** @type {chunks.QuestionChunk} */
    const chunk = {
      type: 'question',
      questionId: res.locals.question.id,
    };
    await chunks.ensureChunksForCourseAsync(question_course.id, chunk);

    const clientFilesDir = path.join(
      coursePath,
      'questions',
      res.locals.question.directory,
      'clientFilesQuestion',
    );
    res.sendFile(filename, { root: clientFilesDir });
  }),
);

module.exports = router;
