import asyncHandler = require('express-async-handler');

import { checkPlanGrantsForQuestion } from '../lib/billing/plan-grants';

export default asyncHandler(async (req, res, next) => {
  const hasPlanGrants = await checkPlanGrantsForQuestion(res);

  if (!hasPlanGrants) {
    // TODO: Show a fancier error page explaining what happened and prompting
    // the user to contact their instructor.
    throw new Error('Access denied');
  }

  next();
});
