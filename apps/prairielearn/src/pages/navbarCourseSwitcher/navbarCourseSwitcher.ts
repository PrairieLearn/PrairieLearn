import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { selectCoursesWithStaffAccess } from '../../models/course.js';

import { NavbarCourseSwitcher } from './navbarCourseSwitcher.html.js';

const router = Router({
  mergeParams: true, // Ensures that navbarCourseSwitcher can retrieve req.params.course_id from the parent router
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const courses = await selectCoursesWithStaffAccess({
      user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
    });
    res.send(
      NavbarCourseSwitcher({
        courses,
        current_course_id: req.params.course_id,
        plainUrlPrefix: res.locals.plainUrlPrefix,
      }),
    );
  }),
);

export default router;
