const path = require('path');
const express = require('express');
const router = express.Router();

const error = require('@prairielearn/error');
const chunks = require('../../lib/chunks');
const ERR = require('async-stacktrace');

router.get('/*', function (req, res, next) {
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
});

module.exports = router;
