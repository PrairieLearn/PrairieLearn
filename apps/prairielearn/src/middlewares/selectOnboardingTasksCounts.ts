import asyncHandler from 'express-async-handler';

import { getOnboardingSteps } from '../lib/onboarding.js';

export default asyncHandler(async (req, res, next) => {
  const course_id = res.locals.course?.id;

  if (course_id && res.locals.course.show_onboarding) {
    const steps = await getOnboardingSteps({
      course_id,
    });

    res.locals.navbarCompleteOnboardingTasksCount = steps.filter((step) => step.isComplete).length;
    res.locals.navbarTotalOnboardingTasksCount = steps.length;
  } else {
    // Defensively set to zero, since most uses of navbarCompleteOnboardingTasksCount and
    // navbarTotalOnboardingTasksCount treat them as non-optional values.
    res.locals.navbarCompleteOnboardingTasksCount = 0;
    res.locals.navbarTotalOnboardingTasksCount = 0;
  }
  next();
});
