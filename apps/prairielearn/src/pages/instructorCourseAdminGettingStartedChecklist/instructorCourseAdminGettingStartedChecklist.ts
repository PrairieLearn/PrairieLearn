import * as express from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';

import { getGettingStartedSteps } from '../../lib/getting-started.js';
import { updateCourseShowGettingStarted } from '../../models/course.js';

import { InstructorCourseAdminGettingStartedChecklist } from './instructorCourseAdminGettingStartedChecklist.html.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.send(
      InstructorCourseAdminGettingStartedChecklist({
        resLocals: res.locals,
        steps: await getGettingStartedSteps({ course_id: res.locals.course.id }),
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

    const course_id = res.locals.course.id;

    if (req.body.__action === 'dismiss_getting_started_checklist') {
      await updateCourseShowGettingStarted({
        course_id,
        show_getting_started: false,
      });
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
    flash(
      'success',
      'The getting started checklist has been dismissed. You can restore it from your course settings.',
    );
    res.redirect(`${res.locals.urlPrefix}/course_admin/settings`);
  }),
);

export default router;
