import { Router } from 'express';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import {
  type AssessmentAuthzResult,
  AssessmentAuthzResultSchema,
} from '../../lib/assessment-access-control/authz-result.js';
import {
  resolveModernAssessmentAccessResultsBatch,
  resolverResultToAssessmentAuthzResultForInstance,
} from '../../lib/assessment-access-control/authz.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import logPageView from '../../middlewares/logPageView.js';

import {
  type StudentAssessmentSummary,
  StudentAssessmentSummarySchema,
  StudentAssessments,
  type StudentAssessmentsRow,
} from './studentAssessments.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router();

const StudentAssessmentsQueryRowSchema = StudentAssessmentSummarySchema.extend({
  authz_result: AssessmentAuthzResultSchema,
});

function buildStudentAssessmentsRow(
  summary: StudentAssessmentSummary,
  authzResult: AssessmentAuthzResult,
): StudentAssessmentsRow {
  return {
    ...summary,
    authorized: authzResult.authorized,
    credit_date_string: authzResult.credit_date_string ?? 'None',
    active: authzResult.active,
    access_rules: authzResult.access_rules,
    access_timeline: authzResult.access_timeline,
    show_closed_assessment_score: authzResult.show_closed_assessment_score,
    show_before_release: authzResult.show_before_release,
    will_release_at: authzResult.next_active_time,
  };
}

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
      StudentAssessmentsQueryRowSchema,
    );

    const hasModern = rows.some((r) => r.modern_access_control);
    const modernAccessByAssessment = hasModern
      ? await resolveModernAssessmentAccessResultsBatch({
          courseInstance: res.locals.course_instance,
          userId: res.locals.user.id,
          authzData: res.locals.authz_data,
          reqDate: res.locals.req_date,
        })
      : null;

    const resolvedRows = rows
      .map((row): StudentAssessmentsRow | null => {
        const { authz_result: legacyAuthzResult, ...summary } = row;
        if (!row.modern_access_control) {
          return buildStudentAssessmentsRow(summary, legacyAuthzResult);
        }

        const assessmentAccess = modernAccessByAssessment?.get(row.assessment_id);
        if (!assessmentAccess) return null;
        const authzResult = resolverResultToAssessmentAuthzResultForInstance({
          result: assessmentAccess,
          authzMode: res.locals.authz_data.mode,
          displayTimezone: res.locals.course_instance.display_timezone,
          assessmentInstance:
            row.assessment_instance_id == null
              ? null
              : {
                  open: row.assessment_instance_open,
                  date_limit: row.assessment_instance_date_limit,
                },
          reqDate: res.locals.req_date,
        });

        return buildStudentAssessmentsRow(summary, authzResult);
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
