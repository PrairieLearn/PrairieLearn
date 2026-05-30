import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';

import { formatDate, formatInterval } from '@prairielearn/formatter';
import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  deleteAllAssessmentInstancesForAssessment,
  gradeAllAssessmentInstances,
} from '../../lib/assessment.js';
import { regradeAllAssessmentInstances } from '../../lib/regrading.js';
import {
  type TimeLimitBaseTime,
  updateAssessmentInstancesTimeLimit,
} from '../../models/assessment-instance.js';
import {
  type AssessmentInstanceRow,
  AssessmentInstanceRowQuerySchema,
} from '../../pages/instructorAssessmentInstances/instructorAssessmentInstances.types.js';

import {
  requireCourseInstancePermissionEdit,
  requireCourseInstancePermissionView,
  t,
} from './init.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Loads the assessment instances for the table, formatting dates/durations in
 * the course instance's timezone. Shared between the page's initial server
 * render and the `list` query so both produce identical row shapes.
 */
export async function selectAssessmentInstancesForTable({
  assessment_id,
  timezone,
}: {
  assessment_id: string;
  timezone: string;
}): Promise<AssessmentInstanceRow[]> {
  const assessmentInstances = await sqldb.queryRows(
    sql.select_assessment_instances,
    { assessment_id },
    AssessmentInstanceRowQuerySchema,
  );
  return assessmentInstances.map((instance) => ({
    ...instance,
    date_formatted: formatDate(instance.assessment_instance.date!, timezone),
    duration_formatted: formatInterval(instance.assessment_instance.duration ?? 0),
  }));
}

const AssessmentInstanceIdsInputSchema = z.object({
  assessmentInstanceIds: z.array(IdSchema).min(1),
});

const TimeLimitActionSchema = z.enum([
  'add',
  'subtract',
  'set_total',
  'set_rem',
  'set_exact',
  'remove',
  'expire',
  'reopen_without_limit',
]);

const list = t.procedure.use(requireCourseInstancePermissionView).query(
  async ({ ctx }) =>
    await selectAssessmentInstancesForTable({
      assessment_id: ctx.assessment.id,
      timezone: ctx.course_instance.display_timezone,
    }),
);

const setTimeLimit = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    AssessmentInstanceIdsInputSchema.extend({
      action: TimeLimitActionSchema,
      time_add: z.number().optional(),
      date: z.string().optional(),
      reopen_closed: z.boolean().optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    let base_time: TimeLimitBaseTime = 'date_limit';
    let time_add = input.time_add ?? 0;
    let exact_date = new Date();

    switch (input.action) {
      case 'remove':
      case 'reopen_without_limit':
        base_time = 'null';
        break;
      case 'expire':
        base_time = 'current_date';
        time_add = 0;
        break;
      case 'set_total':
        base_time = 'start_date';
        break;
      case 'set_rem':
        base_time = 'current_date';
        break;
      case 'set_exact':
        base_time = 'exact_date';
        time_add = 0;
        exact_date = new Date(
          Temporal.PlainDateTime.from(input.date ?? '').toZonedDateTime(
            ctx.course_instance.display_timezone,
          ).epochMilliseconds,
        );
        break;
      case 'subtract':
        time_add *= -1;
        break;
      case 'add':
        break;
    }

    await updateAssessmentInstancesTimeLimit({
      assessment_id: ctx.assessment.id,
      assessment_instance_ids: input.assessmentInstanceIds,
      base_time,
      time_add,
      exact_date,
      reopen_closed: input.reopen_closed ?? false,
      authn_user_id: ctx.authn_user.id,
    });
  });

const deleteInstances = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(AssessmentInstanceIdsInputSchema)
  .mutation(async ({ input, ctx }) => {
    await deleteAllAssessmentInstancesForAssessment(
      ctx.assessment.id,
      ctx.authn_user.id,
      input.assessmentInstanceIds,
    );
  });

const grade = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(AssessmentInstanceIdsInputSchema)
  .mutation(async ({ input, ctx }) => {
    const jobSequenceId = await gradeAllAssessmentInstances({
      assessment_id: ctx.assessment.id,
      assessment_instance_ids: input.assessmentInstanceIds,
      user_id: ctx.locals.user.id,
      authn_user_id: ctx.authn_user.id,
      close: false,
      ignoreGradeRateLimit: true,
      ignoreRealTimeGradingDisabled: true,
    });
    return { jobSequenceId };
  });

const gradeAndClose = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(AssessmentInstanceIdsInputSchema)
  .mutation(async ({ input, ctx }) => {
    const jobSequenceId = await gradeAllAssessmentInstances({
      assessment_id: ctx.assessment.id,
      assessment_instance_ids: input.assessmentInstanceIds,
      user_id: ctx.locals.user.id,
      authn_user_id: ctx.authn_user.id,
      close: true,
      ignoreGradeRateLimit: true,
      ignoreRealTimeGradingDisabled: true,
    });
    return { jobSequenceId };
  });

const regrade = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(AssessmentInstanceIdsInputSchema)
  .mutation(async ({ input, ctx }) => {
    const jobSequenceId = await regradeAllAssessmentInstances(
      ctx.assessment.id,
      ctx.locals.user.id,
      ctx.authn_user.id,
      input.assessmentInstanceIds,
    );
    return { jobSequenceId };
  });

export const assessmentInstancesRouter = t.router({
  list,
  setTimeLimit,
  delete: deleteInstances,
  grade,
  gradeAndClose,
  regrade,
});
