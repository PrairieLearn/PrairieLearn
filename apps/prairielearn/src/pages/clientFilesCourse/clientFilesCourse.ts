import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { ensureChunksForCourseAsync, getRuntimeDirectoryForCourse } from '../../lib/chunks.js';
import { sendCourseFile } from '../../lib/express/send-file.js';

const router = Router({ mergeParams: true });

router.get(
  '/*',
  asyncHandler(async function (req, res) {
    const filename = req.params[0];
    if (!filename) {
      throw new HttpStatusError(400, 'No filename provided within clientFilesCourse directory');
    }
    const coursePath = getRuntimeDirectoryForCourse(res.locals.course);
    await ensureChunksForCourseAsync(res.locals.course.id, { type: 'clientFilesCourse' });

    await sendCourseFile(res, {
      coursePath,
      directory: 'clientFilesCourse',
      filename,
    });
  }),
);

export default router;
