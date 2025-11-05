import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';

import { NavbarCourseInstanceSwitcher } from './navbarCourseInstanceSwitcher.html.js';

const router = Router({
  mergeParams: true, // Ensures that navbarCourseSwitcher can retrieve req.params.course_instance_id from the parent router
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const course_instances = await selectCourseInstancesWithStaffAccess({
      course: res.locals.course,
      user_id: res.locals.user.user_id,
      authn_user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
      authn_is_administrator: res.locals.authz_data.authn_is_administrator,
    });

    res.send(
      NavbarCourseInstanceSwitcher({
        course_instances,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        current_course_instance_id: req.params.course_instance_id ?? null,
        plainUrlPrefix: res.locals.plainUrlPrefix,
      }),
    );
  }),
);

export default router;
