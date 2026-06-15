import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { selectCourseHasCourseInstances } from '../../models/course-instances.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const courseHasCourseInstances = await selectCourseHasCourseInstances({
      course: res.locals.course,
    });

    if (!courseHasCourseInstances && res.locals.course.show_getting_started) {
      // For brand new courses, users should be redirected to the getting started.
      res.redirect(`/pl/course/${res.locals.course.id}/course_admin/getting_started`);
    } else {
      // Once users have created course instances or completed the getting started,
      // they should have easy access to the course instances via the course instances page.
      res.redirect(`/pl/course/${res.locals.course.id}/course_admin/instances`);
    }
  }),
);

export default router;
