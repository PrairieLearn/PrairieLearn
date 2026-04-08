import { Router } from 'express';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { buildLegacyAccessDisplayModel } from '../../lib/assessment-access-control/access-display.js';
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

    const rowsWithAccessDisplay = rows
      .map((row) => {
        if (!row.modern_access_control) {
          return {
            ...row,
            access_display_model: buildLegacyAccessDisplayModel({
              accessRules: row.access_rules,
              active: row.active,
              nextActiveTime: null,
            }),
          };
        }

        const result = modernResults?.get(row.assessment_id);
        if (!result) return null;

        return {
          ...row,
          authorized: result.authzResult.authorized,
          credit_date_string: result.authzResult.credit_date_string ?? 'None',
          active: result.authzResult.active,
          show_closed_assessment_score: result.authzResult.show_closed_assessment_score,
          show_before_release: result.authzResult.show_before_release,
          access_display_model: result.renderInfo.accessDisplayModel,
        };
      })
      .filter((row): row is NonNullable<typeof row> => {
        if (row == null) return false;
        return row.authorized || row.access_display_model.availability.listed;
      });

    res.send(StudentAssessments({ resLocals: res.locals, rows: rowsWithAccessDisplay }));
  }),
);

export default router;
