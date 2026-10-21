import { Router } from 'express';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { type AssessmentAuthzResult } from '../../lib/assessment-access-control/authz-result.js';
import {
  resolveModernAssessmentAccessResultsBatch,
  resolverResultToAssessmentAuthzResultForInstance,
} from '../../lib/assessment-access-control/authz.js';
import { formatLegacyAssessmentAccess } from '../../lib/assessment-access-control/legacy.js';
import { SprocAuthzAssessmentSchema } from '../../lib/db-types.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import logPageView from '../../middlewares/logPageView.js';

import {
  StudentAssessments,
  type StudentAssessmentsRow,
  StudentAssessmentsRowBaseSchema,
} from './studentAssessments.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router();

const StudentAssessmentsQueryRowSchema = StudentAssessmentsRowBaseSchema.extend({
  raw_authz_result: SprocAuthzAssessmentSchema,
});

router.get(
  '/',
  logPageView('studentAssessments'),
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const rawRows = await queryRows(
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

    const hasModern = rawRows.some((row) => row.modern_access_control);
    const modernAccessByAssessment = hasModern
      ? await resolveModernAssessmentAccessResultsBatch({
          courseInstance: res.locals.course_instance,
          userId: res.locals.user.id,
          authzData: res.locals.authz_data,
          reqDate: res.locals.req_date,
        })
      : null;

    const resolvedRows = rawRows
      .map((rawRow): StudentAssessmentsRow | null => {
        const { raw_authz_result: rawAuthzResult, ...rowData } = rawRow;
        let authzResult: AssessmentAuthzResult;
        if (rawRow.modern_access_control) {
          const assessmentAccess = modernAccessByAssessment?.get(rawRow.assessment_id);
          if (!assessmentAccess) return null;
          authzResult = resolverResultToAssessmentAuthzResultForInstance({
            result: assessmentAccess,
            authzMode: res.locals.authz_data.mode,
            displayTimezone: res.locals.course_instance.display_timezone,
            assessmentInstance:
              rawRow.assessment_instance_id == null
                ? null
                : {
                    open: rawRow.assessment_instance_open,
                    date_limit: rawRow.assessment_instance_date_limit,
                  },
            reqDate: res.locals.req_date,
          });
        } else {
          authzResult = formatLegacyAssessmentAccess(
            rawAuthzResult,
            res.locals.course_instance.display_timezone,
          );
        }

        return { ...rowData, authz_result: authzResult };
      })
      .filter((row): row is NonNullable<typeof row> => {
        if (row == null) return false;
        if (row.authz_result.show_before_release) return true;
        return row.authz_result.authorized;
      });

    res.send(StudentAssessments({ resLocals: res.locals, rows: resolvedRows }));
  }),
);

export default router;
