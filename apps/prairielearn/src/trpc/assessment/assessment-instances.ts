import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { formatDate, formatInterval } from '@prairielearn/formatter';
import * as sqldb from '@prairielearn/postgres';
import { DatetimeLocalStringSchema, IdSchema } from '@prairielearn/zod';

import {
  deleteAllAssessmentInstancesForAssessment,
  gradeAllAssessmentInstances,
} from '../../lib/assessment.js';
import { regradeAllAssessmentInstances } from '../../lib/regrading.js';
import { parseLocalDateTime } from '../../lib/timezones.js';
import {
  type TimeLimitBaseTime,
  updateAssessmentInstancesTimeLimit,
} from '../../models/assessment-instance.js';
import {
  type AssessmentInstanceRow,
  AssessmentInstanceRowQuerySchema,
  type AssessmentInstanceTimeFields,
  PendingRegradeQuestionSchema,
} from '../../pages/instructorAssessmentInstances/instructorAssessmentInstances.types.js';

import {
  requireCourseInstancePermissionEdit,
  requireCourseInstancePermissionView,
  t,
} from './init.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export function getAssessmentInstanceTimeFields(
  assessmentInstance: Pick<
    AssessmentInstanceRow['assessment_instance'],
    'open' | 'date' | 'date_limit' | 'grading_needed'
  >,
  now = new Date(),
): AssessmentInstanceTimeFields {
  const isOpen = assessmentInstance.open === true;
  const dateLimit = assessmentInstance.date_limit;
  const hasTimeLimit = dateLimit != null;
  const secondsRemaining =
    dateLimit != null ? Math.max(0, (dateLimit.getTime() - now.getTime()) / 1000) : null;
  const totalSeconds =
    dateLimit == null
      ? null
      : assessmentInstance.date == null
        ? 0
        : Math.max(0, (dateLimit.getTime() - assessmentInstance.date.getTime()) / 1000);

  let time_remaining: string;
  if (isOpen && hasTimeLimit) {
    if (dateLimit.getTime() <= now.getTime()) {
      time_remaining = 'Expired';
    } else if (Math.floor(secondsRemaining ?? 0) < 60) {
      time_remaining = '< 1 min';
    } else {
      time_remaining = `${Math.floor((secondsRemaining ?? 0) / 60)} min`;
    }
  } else if (isOpen) {
    time_remaining = 'Open (no time limit)';
  } else if (assessmentInstance.grading_needed) {
    time_remaining = 'Closed (pending grading)';
  } else {
    time_remaining = 'Closed';
  }

  let total_time: string;
  if (isOpen && hasTimeLimit) {
    if (assessmentInstance.date == null) {
      total_time = '0 min';
    } else if (Math.floor(totalSeconds ?? 0) < 60) {
      total_time = '< 1 min';
    } else {
      total_time = `${Math.floor((totalSeconds ?? 0) / 60)} min`;
    }
  } else if (isOpen) {
    total_time = 'Open (no time limit)';
  } else {
    total_time = 'Closed';
  }

  return {
    time_remaining,
    time_remaining_sec: isOpen && hasTimeLimit ? secondsRemaining : null,
    total_time,
    total_time_sec: isOpen && hasTimeLimit ? totalSeconds : null,
  };
}

export interface AssessmentInstancesError {
  list: never;
  setTimeLimit: never;
  delete: never;
  grade: never;
  gradeAndClose: never;
  regrade: never;
  regradePreview: never;
}

/**
 * Loads assessment instances for the table, formatting dates/durations in the
 * course instance's timezone.
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
  const now = new Date();
  return assessmentInstances.map((instance) => ({
    ...instance,
    ...getAssessmentInstanceTimeFields(instance.assessment_instance, now),
    date_formatted: instance.assessment_instance.date
      ? formatDate(instance.assessment_instance.date, timezone)
      : '',
    duration_formatted: formatInterval(instance.assessment_instance.duration ?? 0),
  }));
}

const AssessmentInstanceIdsInputSchema = z.object({
  assessmentInstanceIds: z.array(IdSchema).min(1).nullable(),
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
      date: DatetimeLocalStringSchema.optional(),
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
        if (!input.date) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'A date is required when setting an exact closing time.',
          });
        }
        base_time = 'exact_date';
        time_add = 0;
        // A datetime-local value cannot distinguish repeated times during fall-back.
        // Choose the later occurrence, such as 01:30 CST rather than 01:30 CDT in
        // America/Chicago, so the deadline does not expire while that time recurs.
        exact_date = parseLocalDateTime(input.date, ctx.course_instance.display_timezone);
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

const regradePreview = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(AssessmentInstanceIdsInputSchema)
  .query(
    async ({ input, ctx }) =>
      await sqldb.queryRows(
        sql.select_pending_regrade_questions,
        {
          assessment_id: ctx.assessment.id,
          assessment_instance_ids: input.assessmentInstanceIds,
        },
        PendingRegradeQuestionSchema,
      ),
  );

export const assessmentInstancesRouter = t.router({
  list,
  setTimeLimit,
  delete: deleteInstances,
  grade,
  gradeAndClose,
  regrade,
  regradePreview,
});
