import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';

import { getGettingStartedTasks } from '../../lib/getting-started.js';
import { updateCourseShowGettingStarted } from '../../models/course.js';

import { InstructorCourseAdminGettingStarted } from './instructorCourseAdminGettingStarted.html.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.send(
      InstructorCourseAdminGettingStarted({
        resLocals: res.locals,
        tasks: await getGettingStartedTasks({ course: res.locals.course }),
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be course editor)');
    }

    if (res.locals.course.example_course) {
      throw new HttpStatusError(403, 'Access denied. Cannot make changes to example course.');
    }

    if (req.body.__action === 'dismiss_getting_started') {
      await updateCourseShowGettingStarted({
        course_id: res.locals.course.id,
        show_getting_started: false,
      });
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
    flash(
      'success',
      'The getting started checklist has been dismissed. You can restore it from your course settings.',
    );
    res.redirect(`${res.locals.urlPrefix}/course_admin/instances`);
  }),
);

export default router;
