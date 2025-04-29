import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { copyCourseInstanceBetweenCourses } from '../../lib/copy-course-instance.js';
import { idsEqual } from '../../lib/id.js';
import { selectCourseInstanceById } from '../../models/course-instances.js';
import { selectCourseById } from '../../models/course.js';

const router = Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    // It doesn't make much sense to transfer a template course instance to
    // the same template course, so we'll explicitly forbid that.

    if (idsEqual(req.body.course_id, res.locals.course.id)) {
      throw new error.HttpStatusError(
        400,
        'Template course instances cannot be copied to the same course.',
      );
    }

    // This query will implicitly check that the course instance belongs to the given
    // course. We ensure below that the course instance is in fact in a template course.
    const courseInstance = await selectCourseInstanceById(req.body.course_instance_id);
    const course = await selectCourseById(courseInstance.course_id);

    if (!course.template_course && !courseInstance.share_source_publicly) {
      throw new error.HttpStatusError(400, 'Copying this course instance is not permitted');
    }

    await copyCourseInstanceBetweenCourses(res, {
      fromCourse: course,
      fromCourseInstance: courseInstance,
      toCourseId: res.locals.course.id,
    });
  }),
);

export default router;
