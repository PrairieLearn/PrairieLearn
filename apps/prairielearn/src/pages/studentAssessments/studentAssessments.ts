import { Router } from 'express';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import type { CalendarAssessmentEvent } from '../../components/AssessmentCalendar.js';
import {
  resolveModernAssessmentAccessResultsBatch,
  resolverResultToAuthzAssessmentForInstance,
} from '../../lib/assessment-access-control/authz.js';
import { dateControlToCalendarEvents } from '../../lib/assessment-access-control/calendar.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getUrl } from '../../lib/url.js';
import logPageView from '../../middlewares/logPageView.js';

import {
  StudentAssessments,
  type StudentAssessmentsRow,
  StudentAssessmentsRowSchema,
} from './studentAssessments.html.js';

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
        if (!row.modern_access_control) return row;

        const assessmentAccess = modernAccessByAssessment?.get(row.assessment_id);
        if (!assessmentAccess) return null;
        const authzResult = resolverResultToAuthzAssessmentForInstance({
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

        return {
          ...row,
          authorized: authzResult.authorized,
          credit_date_string: authzResult.credit_date_string ?? 'None',
          active: authzResult.active,
          show_closed_assessment_score: authzResult.show_closed_assessment_score,
          show_before_release: authzResult.show_before_release,
          will_release_at: authzResult.next_active_time,
          access_timeline: authzResult.access_timeline,
        };
      })
      .filter((row): row is NonNullable<typeof row> => {
        if (row == null) return false;
        if (row.show_before_release) return true;
        return row.authorized;
      });

    const view = req.query.view === 'calendar' ? 'calendar' : 'list';
    const calendarEvents: CalendarAssessmentEvent[] = [];
    if (view === 'calendar') {
      // Group each assessment's rows (multiple-instance assessments have a
      // header row first — NULLS FIRST in the query — then one row per
      // instance) so link selection can consider all of them.
      const rowsByAssessment = new Map<string, StudentAssessmentsRow[]>();
      for (const row of resolvedRows) {
        if (!row.modern_access_control) continue;
        const group = rowsByAssessment.get(row.assessment_id);
        if (group) {
          group.push(row);
        } else {
          rowsByAssessment.set(row.assessment_id, [row]);
        }
      }

      for (const [assessmentId, group] of rowsByAssessment) {
        const dateControl = modernAccessByAssessment?.get(assessmentId)?.dateControl;
        const dates = dateControlToCalendarEvents(dateControl, res.locals.req_date);
        if (!dates) continue;

        // Match the list view's linking: an active assessment links its main
        // page (the "new instance" target for multiple-instance assessments);
        // an inactive one still links an existing instance when there is one.
        const header = group[0];
        const linkedRow = run(() => {
          if (header.show_before_release) return null;
          if (header.active) return header;
          return group.find((row) => row.assessment_instance_id != null) ?? null;
        });
        calendarEvents.push({
          ...dates,
          assessmentId,
          title: header.title ?? '',
          label: header.label,
          color: header.assessment_set_color,
          assessmentUrl: linkedRow ? `${res.locals.urlPrefix}${linkedRow.link}` : null,
          accessEditUrl: null,
          overrideCount: 0,
        });
      }
    }

    res.send(
      StudentAssessments({
        resLocals: res.locals,
        rows: resolvedRows,
        view,
        calendarEvents,
        search: getUrl(req).search,
      }),
    );
  }),
);

export default router;
