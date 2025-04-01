import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { getModeForRequest } from '../lib/exam-mode.js';

export default asyncHandler(async (req, res, next) => {
  const { mode } = await getModeForRequest(req, res);

  if (mode !== 'Public') {
    throw new HttpStatusError(403, 'Access denied in exam mode.');
  }

  next();
});
