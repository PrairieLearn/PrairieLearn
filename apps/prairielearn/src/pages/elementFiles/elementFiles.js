// @ts-check
const asyncHandler = require('express-async-handler');
import { Router } from 'express';
import { HttpStatusError } from '@prairielearn/error';

const router = Router({ mergeParams: true });

router.get(
  '/*',
  asyncHandler(async (_req, _res) => {
    throw new HttpStatusError(404, 'Unable to serve that file');
  }),
);

export default router;
