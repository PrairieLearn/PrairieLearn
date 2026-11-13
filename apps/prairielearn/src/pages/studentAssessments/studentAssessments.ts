import { Router } from 'express';

import { typedAsyncHandler } from '../../lib/res-locals.js';
import { selectStudentAssessments } from '../../lib/student-assessments.js';
import logPageView from '../../middlewares/logPageView.js';

import { StudentAssessments } from './studentAssessments.html.js';

const router = Router();

router.get(
  '/',
  logPageView('studentAssessments'),
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const rows = await selectStudentAssessments({
      courseInstance: res.locals.course_instance,
      userId: res.locals.user.id,
      authzData: res.locals.authz_data,
      reqDate: res.locals.req_date,
    });

    res.send(StudentAssessments({ resLocals: res.locals, rows }));
  }),
);

export default router;
