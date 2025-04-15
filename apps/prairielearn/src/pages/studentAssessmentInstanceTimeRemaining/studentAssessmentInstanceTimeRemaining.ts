import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import selectAndAuthzAssessmentInstance from '../../middlewares/selectAndAuthzAssessmentInstance.js';
import studentAssessmentAccess from '../../middlewares/studentAssessmentAccess.js';

const router = Router({ mergeParams: true });

router.use(selectAndAuthzAssessmentInstance);
router.use(studentAssessmentAccess);

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
