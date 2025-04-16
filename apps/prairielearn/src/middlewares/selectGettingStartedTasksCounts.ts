import asyncHandler from 'express-async-handler';

import { getGettingStartedTasks } from '../lib/getting-started.js';

export default asyncHandler(async (req, res, next) => {
  if (res.locals.course?.show_getting_started) {
    const tasks = await getGettingStartedTasks({
      course_id: res.locals.course.id,
    });

    res.locals.navbarCompleteGettingStartedTasksCount = tasks.filter(
      (task) => task.isComplete,
    ).length;
    res.locals.navbarTotalGettingStartedTasksCount = tasks.length;
  }
  next();
});
