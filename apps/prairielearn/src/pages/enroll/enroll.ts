import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { EnrollPageRemoved, EnrollmentLimitExceededMessage } from './enroll.html.js';

const router = Router();

router.get('/', [
  asyncHandler(async (_req, res) => {
    res.send(EnrollPageRemoved({ resLocals: res.locals }));
  }),
]);

router.get(
  '/limit_exceeded',
  asyncHandler((_req, res) => {
    // Note that we deliberately omit the `forbidAccessInExamMode` middleware
    // here. A student could conceivably hit an enrollment limit while in exam
    // mode, so we'll allow them to see the error message. This page doesn't
    // leak any course-specific information.
    res.send(EnrollmentLimitExceededMessage({ resLocals: res.locals }));
  }),
);

export default router;
