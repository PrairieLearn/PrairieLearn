// @ts-check
const asyncHandler = require('express-async-handler');
const path = require('path');
const express = require('express');

const error = require('@prairielearn/error');
const chunks = require('../../lib/chunks');

const router = express.Router({ mergeParams: true });

router.get(
  '/*',
  asyncHandler(async function (req, res) {
    const filename = req.params[0];
    if (!filename) {
      throw error.make(400, 'No filename provided within clientFilesCourse directory');
    }
    const coursePath = chunks.getRuntimeDirectoryForCourse(res.locals.course);
    await chunks.ensureChunksForCourseAsync(res.locals.course.id, { type: 'clientFilesCourse' });

    const clientFilesDir = path.join(coursePath, 'clientFilesCourse');
    res.sendFile(filename, { root: clientFilesDir });
  }),
);

module.exports = router;
