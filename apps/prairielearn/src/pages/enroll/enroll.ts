import { Router } from 'express';

import { typedAsyncHandler } from '../../lib/res-locals.js';

import { EnrollmentLimitExceededMessage } from './enroll.html.js';

const router = Router();

router.get(
  '/limit_exceeded',
  typedAsyncHandler<'plain'>((_req, res) => {
    // Note that we deliberately omit the `forbidAccessInExamMode` middleware
    // here. A student could conceivably hit an enrollment limit while in exam
    // mode, so we'll allow them to see the error message. This page doesn't
    // leak any course-specific information.
    res.send(EnrollmentLimitExceededMessage({ resLocals: res.locals }));
  }),
);

export default router;
