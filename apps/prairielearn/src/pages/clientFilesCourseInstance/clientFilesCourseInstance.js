const path = require('path');
const express = require('express');
const router = express.Router();

const error = require('@prairielearn/error');
const chunks = require('../../lib/chunks');
const ERR = require('async-stacktrace');

router.get('/*', function (req, res, next) {
  const filename = req.params[0];
  if (!filename) {
    return next(error.make(400, 'No filename provided within clientFilesCourseInstance directory'));
  }
  const coursePath = chunks.getRuntimeDirectoryForCourse(res.locals.course);
  const chunk = {
    type: 'clientFilesCourseInstance',
    courseInstanceId: res.locals.course_instance.id,
  };
  chunks.ensureChunksForCourse(res.locals.course.id, chunk, (err) => {
    if (ERR(err, next)) return;

    const clientFilesDir = path.join(
      coursePath,
      'courseInstances',
      res.locals.course_instance.short_name,
      'clientFilesCourseInstance',
    );
    res.sendFile(filename, { root: clientFilesDir });
  });
});

module.exports = router;
