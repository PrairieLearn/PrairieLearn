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

    if (!courseHasCourseInstances) {
      // We believe that for brand new courses, users want to create questions first.
      // New users likely aren't ready to offer anything to students yet, and
      // questions are what make PrairieLearn really unique.
      res.redirect(`/pl/course/${res.locals.course.id}/course_admin/questions`);
    } else {
      // Once users have created course instances, they should have easy access
      // to them via the course instances page.
      res.redirect(`/pl/course/${res.locals.course.id}/course_admin/instances`);
    }
  }),
);

export default router;
