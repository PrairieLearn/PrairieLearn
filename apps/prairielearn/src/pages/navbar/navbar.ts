import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import authzCourseOrInstance = require('../../middlewares/authzCourseOrInstance');
import { NavbarCourseInstanceSwitcher, NavbarCourseSwitcher } from './navbar.html';
import { selectAuthorizedCourseInstancesForCourse } from '../../models/course-instances';
import { selectAuthorizedCourses } from '../../models/course';

const router = Router();

router.use('/course/:course_id', authzCourseOrInstance);
router.use('/course_instance/:course_instance_id', authzCourseOrInstance);

// Renders the course switcher for a specific course.
router.get(
  '/course/:course_id/switcher',
  asyncHandler(async (req, res) => {
    const courses = await selectAuthorizedCourses({
      user_id: res.locals.user.user_id,
      is_administrator: res.locals.is_administrator,
      current_course: res.locals.course,
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

// Renders the course instance switcher for a particular course, optionally
// with a particular course instance selected.
router.get(
  '/course/:course_id/course_instance_switcher/:course_instance_id?',
  asyncHandler(async (req, res) => {
    const course_instances = await selectAuthorizedCourseInstancesForCourse({
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
