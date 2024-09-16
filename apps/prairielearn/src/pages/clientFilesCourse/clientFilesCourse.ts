import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { getRuntimeDirectoryForCourse, ensureChunksForCourseAsync } from '../../lib/chunks.js';

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

    const clientFilesDir = path.join(coursePath, 'clientFilesCourse');
    res.sendFile(filename, { root: clientFilesDir });
  }),
);

export default router;
