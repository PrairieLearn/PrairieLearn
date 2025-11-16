import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { idsEqual } from '../../lib/id.js';
import { selectCoursesWithStaffAccess } from '../../models/course.js';

import { NavbarCourseSwitcher } from './navbarCourseSwitcher.html.js';

const router = Router({
  mergeParams: true, // Ensures that navbarCourseSwitcher can retrieve req.params.course_id from the parent router
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    let courses = await selectCoursesWithStaffAccess({
      user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
    });

    // If the user is trying to emulate another user, limit the switcher to the
    // current course. This shouldn't really matter since we're already using
    // the authenticated user to fetch the list of courses, but this could help
    // prevent confusion.
    if (req.cookies.pl2_requested_uid) {
      courses = courses.filter((c) => idsEqual(c.id, req.params.course_id));
    }

    res.send(
      NavbarCourseSwitcher({
        courses,
        current_course_id: req.params.course_id,
      }),
    );
  }),
);

export default router;
