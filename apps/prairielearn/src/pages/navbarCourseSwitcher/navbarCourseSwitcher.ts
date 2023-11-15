import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { NavbarCourseSwitcher } from './navbarCourseSwitcher.html';
import { selectCoursesWithStaffAccess } from '../../models/course';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const courses = await selectCoursesWithStaffAccess({
      course_id: req.params.course_id,
      user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
      // We deliberately skip the `authzCourseOrInstance` middleware for this
      // route, so `res.locals.authz_data.overrides` won't be populated here.
      // We can safely set this to null since by default we won't try to render
      // the course switcher if any overrides are active. Even if someone hits
      // this URL directly, they'll still only see the courses to which they
      // have access, so we don't leak any information.
      authz_data_overrides: null,
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
