import asyncHandler from 'express-async-handler';

import { getOnboardingSteps } from '../lib/onboarding.js';

export default asyncHandler(async (req, res, next) => {
  const course_id = res.locals.course?.id ?? null;

  const steps = await getOnboardingSteps({
    course_id,
  });

  res.locals.navbarCompleteOnboardingTasksCount = steps.filter((step) => step.isComplete).length;
  res.locals.navbarTotalOnboardingTasksCount = steps.length;
  next();
});
