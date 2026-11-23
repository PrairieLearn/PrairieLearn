import { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { IdSchema } from '@prairielearn/zod';

import {
  gradeAllAssessmentInstances,
  setAssessmentInstancePoints,
  setAssessmentInstanceScore,
} from '../../../../lib/assessment.js';
import * as ltiOutcomes from '../../../../lib/ltiOutcomes.js';
import {
  type TimeLimitBaseTime,
  updateAssessmentInstancesTimeLimit,
} from '../../../../models/assessment-instance.js';
import { selectAssessmentInstancesForTable } from '../../../../trpc/assessment/assessment-instances.js';

import {
  ASSESSMENT_INPUT,
  type AssessmentActionContext,
  CourseActionError,
  assessmentAction,
  count,
} from './action.js';

const AttemptIdsSchema = z
  .array(IdSchema)
  .min(1)
  .max(1000)
  .describe('IDs of the attempts, from the id column of the assessment_instances dataset.');

/** The attempts on the action's assessment, in the order asked, or an error the agent can act on. */
async function selectAttempts(ctx: AssessmentActionContext, attemptIds: string[]) {
  const rows = await selectAssessmentInstancesForTable({
    assessment_id: ctx.assessment.id,
    timezone: ctx.course_instance.display_timezone,
  });
  const byId = new Map(rows.map((row) => [row.assessment_instance.id, row]));
  const ids = [...new Set(attemptIds)];
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new CourseActionError(
      `The assessment "${ctx.assessment.tid}" has no attempt with ID ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ', …' : ''}. Find attempt IDs in the assessment_instances dataset, filtered by assessment_tid.`,
    );
  }
  return ids.map((id) => byId.get(id)!);
}

type Attempt = Awaited<ReturnType<typeof selectAttempts>>[number];

/** Whose attempt it is, as staff name students. */
const owner = (attempt: Attempt) =>
  attempt.group ? `Group ${attempt.group.name}` : (attempt.user?.uid ?? 'Unknown user');

/**
 * An attempt's time limit as the moment it ends. The card is compared again at approval, so it
 * cannot show time remaining, which changes by the minute.
 */
const timeLimit = (ctx: AssessmentActionContext, attempt: Attempt) =>
  attempt.assessment_instance.date_limit
    ? `time ends ${formatDate(attempt.assessment_instance.date_limit, ctx.course_instance.display_timezone)}`
    : 'no time limit';

const where = (ctx: AssessmentActionContext) =>
  `${ctx.assessment.title ?? ctx.assessment.tid} · ${ctx.course_instance.short_name}`;

const TIME_LIMIT_CHANGES = {
  add_minutes: { base_time: 'date_limit', sign: 1, needsMinutes: true },
  subtract_minutes: { base_time: 'date_limit', sign: -1, needsMinutes: true },
  set_total_minutes: { base_time: 'start_date', sign: 1, needsMinutes: true },
  set_remaining_minutes: { base_time: 'current_date', sign: 1, needsMinutes: true },
  remove_limit: { base_time: 'null', sign: 0, needsMinutes: false },
  expire_now: { base_time: 'current_date', sign: 0, needsMinutes: false },
} satisfies Record<string, { base_time: TimeLimitBaseTime; sign: number; needsMinutes: boolean }>;

const TimeLimitInputSchema = z.strictObject({
  ...ASSESSMENT_INPUT,
  assessment_instance_ids: AttemptIdsSchema,
  change: z
    .enum([
      'add_minutes',
      'subtract_minutes',
      'set_total_minutes',
      'set_remaining_minutes',
      'remove_limit',
      'expire_now',
    ])
    .describe(
      'add_minutes and subtract_minutes change the limit the attempt has now. set_total_minutes sets the limit counted from when the attempt started. set_remaining_minutes sets it counted from now. remove_limit leaves the attempt open with no limit. expire_now ends the time at once, so PrairieLearn closes the attempt.',
    ),
  minutes: z
    .number()
    .int()
    .positive()
    .max(100_000)
    .optional()
    .describe('How many minutes. Required for every change except remove_limit and expire_now.'),
  reopen_closed: z
    .boolean()
    .optional()
    .describe(
      'Whether to also reopen attempts that have already closed. Without it they stay closed and unchanged.',
    ),
});

function timeLimitTitle(input: z.infer<typeof TimeLimitInputSchema>, attempts: number) {
  const target = count(attempts, 'attempt');
  switch (input.change) {
    case 'add_minutes':
      return `Add ${count(input.minutes ?? 0, 'minute')} to ${target}`;
    case 'subtract_minutes':
      return `Take ${count(input.minutes ?? 0, 'minute')} off ${target}`;
    case 'set_total_minutes':
      return `Set the time limit to ${count(input.minutes ?? 0, 'minute')} in total on ${target}`;
    case 'set_remaining_minutes':
      return `Set the time left to ${count(input.minutes ?? 0, 'minute')} on ${target}`;
    case 'remove_limit':
      return `Remove the time limit on ${target}`;
    case 'expire_now':
      return `End the time now on ${target}`;
  }
}

/** The attempts a time limit change applies to: open ones, and closed ones only when asked. */
async function timeLimitAttempts(
  ctx: AssessmentActionContext,
  input: z.infer<typeof TimeLimitInputSchema>,
) {
  if (TIME_LIMIT_CHANGES[input.change].needsMinutes && input.minutes === undefined) {
    throw new CourseActionError(`The change ${input.change} needs minutes.`);
  }
  const attempts = await selectAttempts(ctx, input.assessment_instance_ids);
  const changing = attempts.filter(
    (attempt) => attempt.assessment_instance.open === true || input.reopen_closed === true,
  );
  if (changing.length === 0) {
    throw new CourseActionError(
      `${attempts.length === 1 ? 'This attempt is' : 'These attempts are'} closed, so a time limit change does nothing. Set reopen_closed to reopen ${attempts.length === 1 ? 'it' : 'them'} with the new limit, or use assessment_instances_reopen.`,
    );
  }
  return { attempts, changing };
}

async function closedOrOpenAttempts(
  ctx: AssessmentActionContext,
  attemptIds: string[],
  open: boolean,
) {
  const attempts = await selectAttempts(ctx, attemptIds);
  const changing = attempts.filter(
    (attempt) => (attempt.assessment_instance.open === true) === open,
  );
  if (changing.length === 0) {
    throw new CourseActionError(
      `${attempts.length === 1 ? 'This attempt is' : 'These attempts are'} already ${open ? 'closed' : 'open'}.`,
    );
  }
  return { attempts, changing };
}

const AttemptIdsInputSchema = z.strictObject({
  ...ASSESSMENT_INPUT,
  assessment_instance_ids: AttemptIdsSchema,
});

export const attemptActions = {
  assessment_instances_set_time_limit: assessmentAction({
    group: 'assessment_instances',
    description:
      "Change how long students have on attempts they have already started, such as extra time for one student during an exam. To change the time limit for everyone who has not started yet, edit the assessment's access rules in the course files instead.",
    effects:
      'Students see the new time remaining right away. An attempt whose time runs out closes and is graded.',
    undo: 'Change the limit again, or reopen an attempt that closed.',
    permission: 'student_data_editor',
    input: TimeLimitInputSchema,
    describe: async ({ ctx, input }) => {
      const { attempts, changing } = await timeLimitAttempts(ctx, input);
      const unchanged = attempts.length - changing.length;
      return {
        title: timeLimitTitle(input, changing.length),
        context: [
          where(ctx),
          unchanged > 0 ? `${count(unchanged, 'closed attempt')} left as is` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        rows: changing.map((attempt) => ({
          label: owner(attempt),
          detail:
            attempt.assessment_instance.open === true
              ? `Now: ${timeLimit(ctx, attempt)}`
              : 'Closed, will reopen',
        })),
      };
    },
    run: async ({ ctx, input }) => {
      const { changing } = await timeLimitAttempts(ctx, input);
      const change = TIME_LIMIT_CHANGES[input.change];
      await updateAssessmentInstancesTimeLimit({
        assessment_id: ctx.assessment.id,
        assessment_instance_ids: changing.map((attempt) => attempt.assessment_instance.id),
        base_time: change.base_time,
        time_add: change.sign * (input.minutes ?? 0),
        exact_date: new Date(),
        reopen_closed: input.reopen_closed === true,
        authn_user_id: ctx.user.id,
      });
      return { summary: `Changed the time limit on ${count(changing.length, 'attempt')}.` };
    },
  }),
  assessment_instances_reopen: assessmentAction({
    group: 'assessment_instances',
    description:
      'Reopen attempts that have closed, with no time limit, so students can keep working. Use assessment_instances_set_time_limit with reopen_closed to reopen with a limit instead.',
    effects:
      'The students can answer questions in those attempts again. Their answers and scores so far are kept.',
    undo: 'Close the attempts again.',
    permission: 'student_data_editor',
    input: AttemptIdsInputSchema,
    describe: async ({ ctx, input }) => {
      const { attempts, changing } = await closedOrOpenAttempts(
        ctx,
        input.assessment_instance_ids,
        false,
      );
      const unchanged = attempts.length - changing.length;
      return {
        title: `Reopen ${count(changing.length, 'attempt')}`,
        context: [where(ctx), unchanged > 0 ? `${count(unchanged, 'attempt')} already open` : null]
          .filter(Boolean)
          .join(' · '),
        rows: changing.map((attempt) => ({ label: owner(attempt), detail: 'Closed' })),
      };
    },
    run: async ({ ctx, input }) => {
      const { changing } = await closedOrOpenAttempts(ctx, input.assessment_instance_ids, false);
      await updateAssessmentInstancesTimeLimit({
        assessment_id: ctx.assessment.id,
        assessment_instance_ids: changing.map((attempt) => attempt.assessment_instance.id),
        base_time: 'null',
        time_add: 0,
        exact_date: new Date(),
        reopen_closed: true,
        authn_user_id: ctx.user.id,
      });
      return { summary: `Reopened ${count(changing.length, 'attempt')}.` };
    },
  }),
  assessment_instances_close: assessmentAction({
    group: 'assessment_instances',
    description:
      'Grade and close attempts that are still open, such as after an exam ends or for a student who left one open.',
    effects:
      'Saved answers are graded, and the students can no longer answer questions in those attempts.',
    undo: 'Reopen the attempts. Grading done while closing stays.',
    permission: 'student_data_editor',
    input: AttemptIdsInputSchema,
    describe: async ({ ctx, input }) => {
      const { attempts, changing } = await closedOrOpenAttempts(
        ctx,
        input.assessment_instance_ids,
        true,
      );
      const unchanged = attempts.length - changing.length;
      return {
        title: `Grade and close ${count(changing.length, 'attempt')}`,
        context: [
          where(ctx),
          unchanged > 0 ? `${count(unchanged, 'attempt')} already closed` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        rows: changing.map((attempt) => ({
          label: owner(attempt),
          detail: `Now: open, ${timeLimit(ctx, attempt)}`,
        })),
      };
    },
    run: async ({ ctx, input }) => {
      const { changing } = await closedOrOpenAttempts(ctx, input.assessment_instance_ids, true);
      return {
        jobSequenceId: await gradeAllAssessmentInstances({
          assessment_id: ctx.assessment.id,
          assessment_instance_ids: changing.map((attempt) => attempt.assessment_instance.id),
          user_id: ctx.user.id,
          authn_user_id: ctx.user.id,
          close: true,
          ignoreGradeRateLimit: true,
          ignoreRealTimeGradingDisabled: true,
        }),
      };
    },
    summarizeJob: async () => 'Graded and closed the attempts.',
  }),
  assessment_instances_set_score: assessmentAction({
    group: 'assessment_instances',
    description:
      "Override the total score of one attempt, such as to excuse a student or correct a total by hand. To change one question's score, or to fix scores for everyone after changing points, do not use this.",
    effects:
      'The student sees the new total, and the gradebook uses it. Later grading in the attempt recalculates the total and replaces the override.',
    undo: 'Set the earlier score again. The score history keeps every change.',
    permission: 'student_data_editor',
    input: z.strictObject({
      ...ASSESSMENT_INPUT,
      assessment_instance_id: IdSchema.describe(
        'ID of the attempt, from the id column of the assessment_instances dataset.',
      ),
      set: z
        .enum(['score_perc', 'points'])
        .describe(
          'score_perc sets the score as a percentage, from 0 to 100 or more with bonus points. points sets the points earned.',
        ),
      value: z.number().min(0).max(1_000_000).describe('The new percentage or points.'),
    }),
    describe: async ({ ctx, input }) => {
      const [attempt] = await selectAttempts(ctx, [input.assessment_instance_id]);
      const { score_perc, points, max_points } = attempt.assessment_instance;
      return {
        title:
          input.set === 'score_perc'
            ? `Set the total score to ${input.value}%`
            : `Set the total to ${count(input.value, 'point')}`,
        context: where(ctx),
        rows: [
          {
            label: owner(attempt),
            detail: `Now: ${(score_perc ?? 0).toFixed(1)}% (${points ?? 0} of ${max_points ?? 0} points)`,
          },
        ],
      };
    },
    run: async ({ ctx, input }) => {
      const [attempt] = await selectAttempts(ctx, [input.assessment_instance_id]);
      const id = attempt.assessment_instance.id;
      if (input.set === 'score_perc') {
        await setAssessmentInstanceScore(id, input.value, ctx.user.id);
      } else {
        await setAssessmentInstancePoints(id, input.value, ctx.user.id);
      }
      await ltiOutcomes.updateScore(id);
      return {
        summary:
          input.set === 'score_perc'
            ? `Set the total score of ${owner(attempt)} to ${input.value}%.`
            : `Set the total of ${owner(attempt)} to ${count(input.value, 'point')}.`,
      };
    },
  }),
};
