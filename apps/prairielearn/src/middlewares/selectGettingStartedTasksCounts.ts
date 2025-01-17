import asyncHandler from 'express-async-handler';

import { getGettingStartedSteps } from '../lib/getting-started.js';

export default asyncHandler(async (req, res, next) => {
  if (res.locals.course?.show_getting_started_checklist) {
    const steps = await getGettingStartedSteps({
      course_id: res.locals.course.id,
    });

    res.locals.navbarCompleteGettingStartedTasksCount = steps.filter(
      (step) => step.isComplete,
    ).length;
    res.locals.navbarTotalGettingStartedTasksCount = steps.length;
  }
  next();
});
