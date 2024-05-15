import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';

import { NavbarCourseInstanceSwitcher } from './navbarCourseInstanceSwitcher.html.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const course_instances = await selectCourseInstancesWithStaffAccess({
      course_id: res.locals.course.id,
      user_id: res.locals.user.user_id,
      authn_user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
      authn_is_administrator: res.locals.authz_data.authn_is_administrator,
    });

    res.send(
      NavbarCourseInstanceSwitcher({
        course_instances,
        current_course_instance_id: req.params.course_instance_id ?? null,
        plainUrlPrefix: res.locals.plainUrlPrefix,
      }),
    );
  }),
);

export default router;
