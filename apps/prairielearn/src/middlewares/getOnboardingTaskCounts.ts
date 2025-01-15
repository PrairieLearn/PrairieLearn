import asyncHandler from 'express-async-handler';

import { selectCourseHasAssessments } from '../lib/assessment.js';
import { selectCourseHasCourseInstances } from '../models/course-instances.js';
import { selectCourseHasQuestions } from '../models/questions.js';
import { selectCourseHasAddedStaff } from '../pages/instructorCourseAdminOnboarding/instructorCourseAdminOnboarding.js';

export default asyncHandler(async (req, res, next) => {
  // Get the number of complete onboarding tasks, and the total number of onboarding tasks
  const course_id = res.locals.course?.id ?? null;

  const taskCompletionStatuses = [
    // TODO: improve the variable name
    await selectCourseHasAddedStaff({ course_id }),
    await selectCourseHasQuestions({ course_id }),
    await selectCourseHasCourseInstances({ course_id }),
    await selectCourseHasAssessments({ course_id }),
  ];

  res.locals.navbarCompleteOnboardingTasksCount = taskCompletionStatuses.filter(
    (status) => status,
  ).length;
  res.locals.navbarTotalOnboardingTasksCount = taskCompletionStatuses.length;
  next();
});
