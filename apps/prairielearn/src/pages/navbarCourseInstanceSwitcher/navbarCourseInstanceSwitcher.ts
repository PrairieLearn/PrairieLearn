import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { extractPageContext } from '../../lib/client/page-context.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';

import { NavbarCourseInstanceSwitcher } from './navbarCourseInstanceSwitcher.html.js';

const router = Router({
  mergeParams: true, // Ensures that navbarCourseSwitcher can retrieve req.params.course_instance_id from the parent router
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { authz_data: authzData, course } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });
    const course_instances = await selectCourseInstancesWithStaffAccess({
      course,
      authzData,
      requiredRole: ['Previewer', 'Student Data Viewer'],
    });

    res.send(
      NavbarCourseInstanceSwitcher({
        course_instances,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        current_course_instance_id: req.params.course_instance_id ?? null,
      }),
    );
  }),
);

export default router;
