import asyncHandler from 'express-async-handler';

import { getOnboardingSteps } from '../lib/onboarding.js';

export default asyncHandler(async (req, res, next) => {
  // Get the number of complete onboarding tasks, and the total number of onboarding tasks
  const course_id = res.locals.course?.id ?? null;

  const steps = await getOnboardingSteps({
    course_id,
  });

  res.locals.navbarCompleteOnboardingTasksCount = steps.filter(
    (step) => step.optional || step.isComplete,
  ).length;
  res.locals.navbarTotalOnboardingTasksCount = steps.length;
  next();
});
