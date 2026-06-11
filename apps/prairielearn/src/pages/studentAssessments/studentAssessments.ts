import { Router } from 'express';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

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
      const seen = new Set<string>();
      for (const row of resolvedRows) {
        if (!row.modern_access_control || seen.has(row.assessment_id)) continue;
        seen.add(row.assessment_id);

        const dateControl = modernAccessByAssessment?.get(row.assessment_id)?.dateControl;
        const dates = dateControlToCalendarEvents(dateControl, res.locals.req_date);
        if (!dates) continue;

        // Match the list view: only link the assessment when the student could
        // open it from the list (not "coming soon", and either active or
        // already started).
        const linked =
          !row.show_before_release && (row.active || row.assessment_instance_id != null);
        calendarEvents.push({
          assessmentId: row.assessment_id,
          title: row.title ?? '',
          label: row.label,
          color: row.assessment_set_color,
          assessmentUrl: linked ? `${res.locals.urlPrefix}${row.link}` : null,
          accessEditUrl: null,
          release: dates.release,
          due: dates.due,
          windowStart: dates.windowStart,
          windowEnd: dates.windowEnd,
          afterLastDeadlineCredit: dates.afterLastDeadlineCredit,
          overrideCount: 0,
          timeline: dates.timeline,
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
