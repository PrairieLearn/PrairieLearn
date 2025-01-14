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
      // For brand new courses, we believe users want to create questions first
      // since questions are what make PrairieLearn unique, and many new users likely
      // aren't thinking of immediately offering anything to students
      res.redirect(`/pl/course/${res.locals.course.id}/course_admin/questions`);
    } else {
      // Once users have created course instances, they should have easier access to them
      res.redirect(`/pl/course/${res.locals.course.id}/course_admin/instances`);
    }
  }),
);

export default router;
