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

    if (!courseHasCourseInstances && !res.locals.course.onboarding_dismissed) {
      // For brand new courses, users should be redirected to the onboarding checklist.
      res.redirect(`/pl/course/${res.locals.course.id}/course_admin/onboarding`);
    } else {
      // Once users have created course instances or completed onboarding, they should have
      // easy access to the course instances via the course instances page.
      res.redirect(`/pl/course/${res.locals.course.id}/course_admin/instances`);
    }
  }),
);

export default router;
