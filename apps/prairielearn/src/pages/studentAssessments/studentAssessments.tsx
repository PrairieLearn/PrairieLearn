import { Router } from 'express';
import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';

import { PageLayout } from '../../components/PageLayout.js';
import { resolveModernAssessmentAccessBatch } from '../../lib/assessment-access-control/authz.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import logPageView from '../../middlewares/logPageView.js';

import {
  StudentAssessmentsTable,
  StudentAssessmentsTableRowSchema,
} from './components/StudentAssessmentsTable.js';
import { StudentAssessmentsRowSchema } from './studentAssessments.html.js';

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
          opens_at: result.next_active_time ?? null,
          access_timeline: result.access_timeline,
        };
      })
      .filter((row): row is NonNullable<typeof row> => {
        if (row == null) return false;
        return row.authorized || (row.show_before_release ?? false);
      });

    const { authz_data, course_instance } = res.locals;
    const safeRows = z.array(StudentAssessmentsTableRowSchema).parse(rowsWithAccessDisplay);

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Assessments',
        navContext: {
          type: 'student',
          page: 'assessments',
        },
        content: (
          <>
            <div className="card mb-4">
              <div className="card-header bg-primary text-white">
                <h1>Assessments</h1>
              </div>
              <Hydrate>
                <StudentAssessmentsTable
                  rows={safeRows}
                  courseInstanceId={course_instance.id}
                  displayTimezone={course_instance.display_timezone}
                />
              </Hydrate>
            </div>
            {authz_data.mode === 'Exam' && (
              <p>
                Don't see your exam? Exams for this course are only made available to students with
                checked-in exam reservations who have clicked the "Start exam" button in
                PrairieTest. See a proctor for assistance.
              </p>
            )}
          </>
        ),
      }),
    );
  }),
);

export default router;
