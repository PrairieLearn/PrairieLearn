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
      // We believe that for brand new courses, users want to create questions first,
      // since questions are PrairieLearn's distinctive feature, and since they are likely
      // not yet ready to offer anything to students yet.
      res.redirect(`/pl/course/${res.locals.course.id}/course_admin/questions`);
    } else {
      // Once users have created course instances, they should have immediate access
      // to them in the course instances page.
      res.redirect(`/pl/course/${res.locals.course.id}/course_admin/instances`);
    }
  }),
);

export default router;
