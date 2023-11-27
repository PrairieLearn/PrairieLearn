
import { selectCourseById } from '../../models/course';
import { selectQuestionById } from '../../models/question';

const path = require('path');
const express = require('express');
const router = express.Router({ mergeParams: true });

const error = require('@prairielearn/error');
const chunks = require('../../lib/chunks');
const ERR = require('async-stacktrace');

router.get('/*', function (req, res, next) {
  // TODO hack if the locals doesn't have the stuff on it, assume a public URL and check if the question is publicly shared
  Promise.all([selectCourseById(req.params.course_id), selectQuestionById(req.params.question_id)]).then(([course, question]) => {
    // console.log('reslocals course', res.locals.course);
    // console.log('models course', course)
    res.locals.course = course;
    res.locals.question = question;
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
    // console.log(res.locals.course)
    // console.log(coursePath)
    chunks.ensureChunksForCourse(res.locals.course.id, { type: 'clientFilesCourse' }, (err) => {
      if (ERR(err, next)) return;

      const clientFilesDir = path.join(coursePath, 'clientFilesCourse');
      res.sendFile(filename, { root: clientFilesDir });
    });
  });
});

module.exports = router;
