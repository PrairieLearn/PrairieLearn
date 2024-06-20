// @ts-check
import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import * as chunks from '../../lib/chunks.js';

const router = Router();

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    const filename = req.params[0];
    if (!filename) {
      throw new error.HttpStatusError(
        400,
        'No filename provided within clientFilesAssessment directory',
      );
    }

    const coursePath = chunks.getRuntimeDirectoryForCourse(res.locals.course);
    /** @type {chunks.Chunk} */
    const chunk = {
      type: 'clientFilesAssessment',
      courseInstanceId: res.locals.course_instance.id,
      assessmentId: res.locals.assessment.id,
    };
    await chunks.ensureChunksForCourseAsync(res.locals.course.id, chunk);

    const clientFilesDir = path.join(
      coursePath,
      'courseInstances',
      res.locals.course_instance.short_name,
      'assessments',
      res.locals.assessment.tid,
      'clientFilesAssessment',
    );
    res.sendFile(filename, { root: clientFilesDir });
  }),
);

export default router;
