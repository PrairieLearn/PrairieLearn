import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { features } from '../lib/features/index.js';

export const requirePrintableAssessments = asyncHandler(async (_req, res, next) => {
  if (!(await features.enabledFromLocals('printable-assessments', res.locals))) {
    throw new HttpStatusError(404, 'Not Found');
  }
  next();
});
