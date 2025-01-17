import asyncHandler from 'express-async-handler';

import { getOnboardingSteps } from '../lib/onboarding.js';

export default asyncHandler(async (req, res, next) => {
  if (res.locals.course?.show_onboarding) {
    const steps = await getOnboardingSteps({
      course_id: res.locals.course.id,
    });

    res.locals.navbarCompleteOnboardingTasksCount = steps.filter((step) => step.isComplete).length;
    res.locals.navbarTotalOnboardingTasksCount = steps.length;
  }
  next();
});
