import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { selectCourseHasCourseInstances } from '../../models/course-instances.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const courseHasCourseInstances = await selectCourseHasCourseInstances({
      course_id: res.locals.course.id,
    });

    if (courseHasCourseInstances) {
      // Redirect to the instances page of the course
      res.redirect(`/pl/course/${res.locals.course.id}/course_admin/instances`);
    } else {
      // Redirect to the questions page of the course
      res.redirect(`/pl/course/${res.locals.course.id}/course_admin/questions`);
    }
  }),
);

export default router;
