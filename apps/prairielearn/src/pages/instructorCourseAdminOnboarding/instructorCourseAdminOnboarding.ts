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
    if (res.locals.course.onboarding_dismissed) {
      throw new HttpStatusError(400, 'Onboarding already dismissed');
    }
    const course_id = res.locals.course.id; // TODO/CHECK: Should this be handled with an error?
    res.send(
      InstructorCourseAdminOnboarding({
        resLocals: res.locals,
        steps: await getOnboardingSteps({ course_id }),
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

    if (res.locals.course.onboarding_dismissed) {
      throw new HttpStatusError(400, 'Onboarding already dismissed');
    }

    const course_id = res.locals.course.id;

    const onboardingSteps = await getOnboardingSteps({
      course_id,
    });

    const allRequiredOnboardingTasksComplete = onboardingSteps.every(
      (step) => step.optional || step.isComplete,
    );

    if (!allRequiredOnboardingTasksComplete) {
      throw new HttpStatusError(400, 'All required onboarding tasks must be complete');
    }

    if (req.body.__action === 'dismiss_onboarding') {
      await updateCourseOnboardingDismissed({
        course_id: res.locals.course.id,
        onboarding_dismissed: true,
      });
    } else {
      throw new HttpStatusError(400, `Unknown __action: ${req.body.__action}`);
    }
    flash(
      'success',
      'Onboarding dismissed. You can return to the onboarding page through the Course Settings tab.',
    );
    res.redirect(`${res.locals.urlPrefix}/course_admin/settings`);
  }),
);

export default router;
