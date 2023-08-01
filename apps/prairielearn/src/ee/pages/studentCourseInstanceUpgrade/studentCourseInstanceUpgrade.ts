import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { StudentCourseInstanceUpgrade } from './studentCourseInstanceUpgrade.html';
import { checkPlanGrants } from '../../lib/billing/plan-grants';

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Check if the student is *actually* missing plan grants, or if they just
    // came across this URL on accident. If they have all the necessary plan grants,
    // redirect them back to the assessments page.
    const hasPlanGrants = await checkPlanGrants(res);
    if (hasPlanGrants) {
      res.redirect(`/pl/course_instance/${res.locals.course_instance.id}/assessments`);
      return;
    }

    res.send(StudentCourseInstanceUpgrade({ resLocals: res.locals }));
  }),
);

export default router;
