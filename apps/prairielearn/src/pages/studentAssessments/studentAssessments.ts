import { Router } from 'express';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { resolveModernAssessmentAccessBatch } from '../../lib/assessment-access-control/authz.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import logPageView from '../../middlewares/logPageView.js';

import { StudentAssessments, StudentAssessmentsRowSchema } from './studentAssessments.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router();

router.get(
  '/',
  logPageView('studentAssessments'),
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const rows = await queryRows(
      sql.select_assessments,
      {
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
        user_id: res.locals.user.id,
        req_date: res.locals.req_date,
        assessments_group_by: res.locals.course_instance.assessments_group_by,
      },
      StudentAssessmentsRowSchema,
    );

    const hasModern = rows.some((r) => r.modern_access_control);
    const modernResults = hasModern
      ? await resolveModernAssessmentAccessBatch({
          courseInstance: res.locals.course_instance,
          userId: res.locals.user.id,
          authzData: res.locals.authz_data,
          reqDate: res.locals.req_date,
        })
      : null;

    const resolvedRows = rows
      .map((row) => {
        if (!row.modern_access_control) return row;

        const result = modernResults?.get(row.assessment_id);
        if (!result) return null;

        return {
          ...row,
          authorized: result.authorized,
          credit_date_string: result.credit_date_string ?? 'None',
          active: result.active,
          show_closed_assessment_score: result.show_closed_assessment_score,
          show_before_release: result.show_before_release,
        };
      })
      .filter((row): row is NonNullable<typeof row> => {
        if (row == null) return false;
        if (row.show_before_release) return true;
        return row.authorized;
      });

    res.send(StudentAssessments({ resLocals: res.locals, rows: resolvedRows }));
  }),
);

export default router;
