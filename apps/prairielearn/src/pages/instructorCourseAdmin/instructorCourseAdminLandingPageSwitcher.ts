import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';

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

    console.log('course_instances', course_instances);

    const course_id = req.params.course_id;

    if (course_instances.length === 0) {
      res.redirect(`/pl/course/${course_id}/course_admin/questions`);
    } else {
      res.redirect(`/pl/course/${course_id}/course_admin/instances`);
    }
  }),
);

export default router;
