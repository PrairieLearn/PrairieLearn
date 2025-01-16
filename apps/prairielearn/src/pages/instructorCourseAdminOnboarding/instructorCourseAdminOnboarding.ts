import * as express from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';

import { getOnboardingSteps } from '../../lib/onboarding.js';
import { updateCourseOnboardingDismissed } from '../../models/course.js';

import { InstructorCourseAdminOnboarding } from './instructorCourseAdminOnboarding.html.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.send(
      InstructorCourseAdminOnboarding({
        resLocals: res.locals,
        steps: await getOnboardingSteps({ course_id: res.locals.course.id }),
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied. Must be course editor to make changes.');
    }

    if (res.locals.course.example_course) {
      throw new HttpStatusError(403, 'Access denied. Cannot make changes to example course.');
    }

    if (!res.locals.course.show_onboarding) {
      throw new HttpStatusError(400, 'Onboarding checklist already hidden');
    }

    const course_id = res.locals.course.id;

    if (req.body.__action === 'dismiss_onboarding') {
      await updateCourseOnboardingDismissed({
        course_id,
        show_onboarding: false,
      });
    } else {
      throw new HttpStatusError(400, `Unknown __action: ${req.body.__action}`);
    }
    flash(
      'success',
      'Onboarding checklist dismissed. You can restore it from your course settings.',
    );
    res.redirect(`${res.locals.urlPrefix}/course_admin/settings`);
  }),
);

export default router;
