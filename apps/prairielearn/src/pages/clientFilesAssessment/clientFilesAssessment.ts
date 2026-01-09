import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import {
  type Chunk,
  ensureChunksForCourseAsync,
  getRuntimeDirectoryForCourse,
} from '../../lib/chunks.js';
import { sendCourseFile } from '../../lib/express/send-file.js';

const router = Router();

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    const filename = req.params[0];
    if (!filename) {
      throw new HttpStatusError(400, 'No filename provided within clientFilesAssessment directory');
    }

    const coursePath = getRuntimeDirectoryForCourse(res.locals.course);
    const chunk: Chunk = {
      type: 'clientFilesAssessment',
      courseInstanceId: res.locals.course_instance.id,
      assessmentId: res.locals.assessment.id,
    };
    await ensureChunksForCourseAsync(res.locals.course.id, chunk);

    await sendCourseFile(res, {
      coursePath,
      directory: path.join(
        'courseInstances',
        res.locals.course_instance.short_name,
        'assessments',
        res.locals.assessment.tid,
        'clientFilesAssessment',
      ),
      filename,
    });
  }),
);

export default router;
