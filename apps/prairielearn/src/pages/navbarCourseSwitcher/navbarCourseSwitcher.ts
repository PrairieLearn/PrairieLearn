import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { NavbarCourseSwitcher } from './navbarCourseSwitcher.html';
import { selectAuthorizedCourses } from '../../models/course';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const courses = await selectAuthorizedCourses({
      course_id: res.locals.course.id,
      user_id: res.locals.user.user_id,
      is_administrator: res.locals.is_administrator,
      authz_data_overrides: res.locals.authz_data.overrides,
    });
    res.send(
      NavbarCourseSwitcher({
        courses,
        current_course_id: res.locals.course.id,
        plainUrlPrefix: res.locals.plainUrlPrefix,
      }),
    );
  }),
);

export default router;
