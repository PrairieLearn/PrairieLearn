import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { copyCourseInstanceBetweenCourses } from '../../lib/copy-content.js';
import { selectOptionalCourseInstanceById } from '../../models/course-instances.js';
import { selectCourseById } from '../../models/course.js';

const router = Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const courseInstance = await selectOptionalCourseInstanceById({
      id: req.body.course_instance_id,
      requestedRole: 'Any',
      authzData: res.locals.authz_data,
    });
    if (!courseInstance?.share_source_publicly) {
      throw new error.HttpStatusError(404, 'Not Found');
    }
    const course = await selectCourseById(courseInstance.course_id);

    await copyCourseInstanceBetweenCourses(res, {
      fromCourse: course,
      fromCourseInstance: courseInstance,
      toCourseId: res.locals.course.id,
    });
  }),
);

export default router;
