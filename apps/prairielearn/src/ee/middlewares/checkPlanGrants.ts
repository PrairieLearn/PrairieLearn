import asyncHandler = require('express-async-handler');
import error = require('@prairielearn/error');

import { checkPlanGrants } from '../lib/billing/plan-grants';

export default asyncHandler(async (req, res, next) => {
  const hasPlanGrants = await checkPlanGrants(req, res);

  if (!hasPlanGrants) {
    res.redirect(`/pl/course_instance/${res.locals.course_instance.id}/upgrade`);
  }
});
