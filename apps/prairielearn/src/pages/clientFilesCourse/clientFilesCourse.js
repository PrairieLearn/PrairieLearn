import { selectCourseById } from '../../models/course';
import { selectQuestionById } from '../../models/question';

const path = require('path');
const express = require('express');
const router = express.Router({ mergeParams: true });

const error = require('@prairielearn/error');
const chunks = require('../../lib/chunks');
const ERR = require('async-stacktrace');

router.get('/*', function (req, res, next) {
  console.log('course id', req.params.course_id);
  Promise.all(
    res.locals.public
      ? [selectCourseById(req.params.course_id), selectQuestionById(req.params.question_id)]
      : [Promise.resolve(res.locals.course), Promise.resolve(res.locals.question)],
  )
    .then(([course, question]) => {
      res.locals.course = course;
      res.locals.question = question;
      if (res.locals.public && !res.locals.question.shared_publicly) {
        return next(error.make(404, 'Not Found'));
      }

      const filename = req.params[0];
      if (!filename) {
        return next(
          error.make(400, 'No filename provided within clientFilesCourse directory', {
            locals: res.locals,
            body: req.body,
          }),
        );
      }
      const coursePath = chunks.getRuntimeDirectoryForCourse(res.locals.course);
      chunks.ensureChunksForCourse(res.locals.course.id, { type: 'clientFilesCourse' }, (err) => {
        if (ERR(err, next)) return;

        const clientFilesDir = path.join(coursePath, 'clientFilesCourse');
        res.sendFile(filename, { root: clientFilesDir });
      });
    })
    .catch((err) => next(err));
});

module.exports = router;
