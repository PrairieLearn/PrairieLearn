import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import authzCourseOrInstance = require('../../middlewares/authzCourseOrInstance');
import { NavbarCourseInstanceSwitcher, NavbarCourseSwitcher } from './navbar.html';
import { selectAuthorizedCourseInstancesForCourse } from '../../models/course-instances';
import { setTimeout } from 'timers/promises';

const router = Router();

router.use('/course/:course_id/switcher', authzCourseOrInstance);
router.use('/course_instance/:course_instance_id/switcher', authzCourseOrInstance);

router.get(
  '/course/:course_id/switcher',
  asyncHandler(async (req, res) => {
    res.send(NavbarCourseSwitcher());
  }),
);

router.get('/course_instance/:course_instance_id/switcher', [
  require('../../middlewares/authzCourseOrInstance'),
  asyncHandler(async (req, res) => {
    const course_instances = await selectAuthorizedCourseInstancesForCourse({
      course_id: res.locals.course.id,
      user_id: res.locals.user.user_id,
      authn_user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
    });

    res.send(
      NavbarCourseInstanceSwitcher({
        course_instances,
        current_course_instance_id: res.locals.course_instance.id,
        plainUrlPrefix: res.locals.plainUrlPrefix,
      }),
    );
  }),
]);

export default router;
