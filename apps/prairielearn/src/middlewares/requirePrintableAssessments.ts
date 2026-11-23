import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { features } from '../lib/features/index.js';

export const requirePrintableAssessments = asyncHandler(async (_req, res, next) => {
  // Everyone has preview access to example courses, so shared print forms there would be one
  // pool that any user could fill or regenerate.
  if (
    res.locals.course.example_course ||
    !(await features.enabledFromLocals('printable-assessments', res.locals))
  ) {
    throw new HttpStatusError(404, 'Not Found');
  }
  next();
});
