// @ts-check
const asyncHandler = require('express-async-handler');
import * as path from 'node:path';
import { Router } from 'express';

import * as error from '@prairielearn/error';
import * as chunks from '../../lib/chunks';

const router = Router({ mergeParams: true });

router.get(
  '/*',
  asyncHandler(async function (req, res) {
    const filename = req.params[0];
    if (!filename) {
      throw new error.HttpStatusError(
        400,
        'No filename provided within clientFilesCourse directory',
      );
    }
    const coursePath = chunks.getRuntimeDirectoryForCourse(res.locals.course);
    await chunks.ensureChunksForCourseAsync(res.locals.course.id, { type: 'clientFilesCourse' });

    const clientFilesDir = path.join(coursePath, 'clientFilesCourse');
    res.sendFile(filename, { root: clientFilesDir });
  }),
);

export default router;
