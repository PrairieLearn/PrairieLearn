import { Router } from 'express';
import asyncHandler from 'express-async-handler';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    if (res.locals.assessment.type !== 'Exam') return next();

    res.send(
      JSON.stringify({
        serverRemainingMS: res.locals.assessment_instance_remaining_ms,
        serverTimeLimitMS: res.locals.assessment_instance_time_limit_ms,
      }),
    );
  }),
);

export default router;
