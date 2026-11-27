import { groupBy } from 'es-toolkit';
import { z } from 'zod';

import { DatetimeLocalStringSchema, IdSchema } from '@prairielearn/zod';

import {
  setAssessmentInstancePoints,
  setAssessmentInstanceScore,
} from '../../../../lib/assessment.js';
import { idsEqual } from '../../../../lib/id.js';
import * as ltiOutcomes from '../../../../lib/ltiOutcomes.js';
import { updateInstanceQuestionScore } from '../../../../lib/manualGrading.js';
import { parseLocalDateTime } from '../../../../lib/timezones.js';
import {
  type TimeLimitBaseTime,
  selectAssessmentInstanceById,
  selectAssessmentInstancesByIdsForAssessment,
  updateAssessmentInstancesTimeLimit,
} from '../../../../models/assessment-instance.js';
import { selectCourseInstanceGraderStaff } from '../../../../models/course-instances.js';
import { selectInstanceQuestionsByIdsForAssessment } from '../../../../models/instance-question.js';
import { updateInstanceQuestions } from '../../../../pages/instructorAssessmentManualGrading/assessmentQuestion/queries.js';

import {
  ASSESSMENT_INPUT,
  type AssessmentActionContext,
  CourseActionError,
  assessmentAction,
  count,
} from './action.js';

function listIds(ids: string[]) {
  return `${ids.slice(0, 20).join(', ')}${ids.length > 20 ? ', …' : ''}`;
}

/** The assessment's attempts with the given IDs. The request is refused if one is not the assessment's. */
async function selectAttempts(ctx: AssessmentActionContext, attemptIds: string[]) {
  const ids = [...new Set(attemptIds)];
  const attempts = await selectAssessmentInstancesByIdsForAssessment({
    assessment_id: ctx.assessment.id,
    assessment_instance_ids: ids,
  });
  const found = new Set(attempts.map((attempt) => attempt.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new CourseActionError(
      `The assessment "${ctx.assessment.tid}" has no attempt with ID ${listIds(missing)}. Find attempt IDs in the assessment_instances dataset, filtered by assessment_tid.`,
    );
  }
  return attempts;
}

/** The assessment's instance questions with the given IDs. The request is refused if one is not the assessment's. */
async function selectQuestions(ctx: AssessmentActionContext, instanceQuestionIds: string[]) {
  const ids = [...new Set(instanceQuestionIds)];
  const questions = await selectInstanceQuestionsByIdsForAssessment({
    assessment_id: ctx.assessment.id,
    instance_question_ids: ids,
  });
  const found = new Set(questions.map(({ instance_question }) => instance_question.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new CourseActionError(
      `The assessment "${ctx.assessment.tid}" has no question in an attempt with ID ${listIds(missing)}. Find the IDs in the instance_questions dataset, filtered by assessment_tid.`,
    );
  }
  return questions;
}

const round = (value: number | null) => Number((value ?? 0).toFixed(2));

/** How the setTimeLimit procedure behind the assessment's Students tab turns each change into an update. */
const TIME_LIMIT_CHANGES = {
  add_minutes: { base_time: 'date_limit', sign: 1, uses: 'minutes' },
  subtract_minutes: { base_time: 'date_limit', sign: -1, uses: 'minutes' },
  set_total_minutes: { base_time: 'start_date', sign: 1, uses: 'minutes' },
  set_remaining_minutes: { base_time: 'current_date', sign: 1, uses: 'minutes' },
  set_closing_time: { base_time: 'exact_date', sign: 0, uses: 'closing_time' },
  remove_limit: { base_time: 'null', sign: 0, uses: null },
  expire_now: { base_time: 'current_date', sign: 0, uses: null },
} satisfies Record<
  string,
  { base_time: TimeLimitBaseTime; sign: number; uses: 'minutes' | 'closing_time' | null }
>;

const TimeLimitInputSchema = z.strictObject({
  ...ASSESSMENT_INPUT,
  assessment_instance_ids: z
    .array(IdSchema)
    .min(1)
    .max(1000)
    .describe(
      'IDs of the attempts, from the id column of the assessment_instances dataset, filtered by assessment_tid.',
    ),
  change: z
    .enum([
      'add_minutes',
      'subtract_minutes',
      'set_total_minutes',
      'set_remaining_minutes',
      'set_closing_time',
      'remove_limit',
      'expire_now',
    ])
    .describe(
      'add_minutes and subtract_minutes change the time left, and apply only to attempts that already have a time limit. set_total_minutes sets the limit counted from when the attempt started. set_remaining_minutes sets it counted from now. set_closing_time sets when the attempt closes. remove_limit leaves the attempt open with no limit. expire_now ends the time at once, so the student can no longer submit answers.',
    ),
  minutes: z
    .number()
    .int()
    .positive()
    .max(100_000)
    .optional()
    .describe(
      'How many minutes. Required for add_minutes, subtract_minutes, set_total_minutes, and set_remaining_minutes.',
    ),
  closing_time: DatetimeLocalStringSchema.optional().describe(
    "When the attempts close, as YYYY-MM-DDTHH:MM in the course instance's timezone. Required for set_closing_time.",
  ),
  reopen_closed: z
    .boolean()
    .optional()
    .describe(
      'Whether to also reopen attempts that have closed, with the new limit. remove_limit with reopen_closed reopens them with no time limit. Without it, closed attempts stay closed and unchanged.',
    ),
});

const SetAttemptScoreInputSchema = z.strictObject({
  ...ASSESSMENT_INPUT,
  assessment_instance_id: IdSchema.describe(
    'ID of the attempt, from the id column of the assessment_instances dataset, filtered by assessment_tid.',
  ),
  score_perc: z
    .number()
    .min(0)
    .max(1000)
    .optional()
    .describe(
      'The new total score as a percentage, from 0 to 100, or more with bonus points. Give this or points.',
    ),
  points: z
    .number()
    .min(0)
    .max(1_000_000)
    .optional()
    .describe('The new total points. Give this or score_perc.'),
});

const QuestionPointsSchema = z.number().min(-100_000).max(100_000);
const QuestionPercentSchema = z.number().min(-1000).max(1000);

const SetQuestionScoreInputSchema = z.strictObject({
  ...ASSESSMENT_INPUT,
  instance_question_id: IdSchema.describe(
    'ID of the question in the attempt, from the id column of the instance_questions dataset, filtered by assessment_tid.',
  ),
  points: QuestionPointsSchema.optional().describe(
    'The new total points for the question. Automatic points stay as they are and manual points make up the difference.',
  ),
  score_perc: QuestionPercentSchema.optional().describe(
    "The new total score as a percentage of the question's maximum points. Automatic points stay as they are and manual points make up the difference.",
  ),
  manual_points: QuestionPointsSchema.optional().describe(
    'The new points from manual grading. Instead of a total, give this or manual_score_perc, auto_points or auto_score_perc, or one of each, to set one part without changing the other.',
  ),
  manual_score_perc: QuestionPercentSchema.optional().describe(
    "The new manual grading score as a percentage of the question's maximum manual points.",
  ),
  auto_points: QuestionPointsSchema.optional().describe('The new points from automatic grading.'),
  auto_score_perc: QuestionPercentSchema.optional().describe(
    "The new automatic grading score as a percentage of the question's maximum automatic points.",
  ),
  feedback: z
    .string()
    .max(10_000)
    .optional()
    .describe(
      "Feedback for the student, in Markdown, shown with the student's last submission as on the manual grading page. It replaces earlier manual grading feedback.",
    ),
});

type SetQuestionScoreInput = z.infer<typeof SetQuestionScoreInputSchema>;

/** Refuses a request that sets the score more than one way, which `updateInstanceQuestionScore` cannot apply. */
function checkOneScore(input: SetQuestionScoreInput) {
  const given = (...keys: (keyof SetQuestionScoreInput)[]) =>
    keys.filter((key) => input[key] !== undefined).length;
  const total = given('points', 'score_perc');
  const manual = given('manual_points', 'manual_score_perc');
  const auto = given('auto_points', 'auto_score_perc');
  const valid = total === 1 ? manual + auto === 0 : manual <= 1 && auto <= 1 && manual + auto > 0;
  if (!valid) {
    throw new CourseActionError(
      'Set the score one way: points or score_perc for the total; or manual_points or manual_score_perc, auto_points or auto_score_perc, or one of each, for the parts.',
    );
  }
}

const AssignGraderInputSchema = z.strictObject({
  ...ASSESSMENT_INPUT,
  instance_question_ids: z
    .array(IdSchema)
    .min(1)
    .max(1000)
    .describe(
      'IDs of the questions in attempts, from the id column of the instance_questions dataset, filtered by assessment_tid.',
    ),
  grader_user_id: IdSchema.nullable()
    .optional()
    .describe(
      'User ID of the staff member who grades these questions, from the user_id column of the staff dataset. null removes the assigned grader. Give this or grader_uid.',
    ),
  grader_uid: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .describe(
      'UID of the staff member who grades these questions, as the instructor typed it, usually an email address. Give this or grader_user_id.',
    ),
});

export const attemptActions = {
  assessment_instances_set_time_limit: assessmentAction({
    description:
      "Change the time limit on attempts students have already started, such as extra time for one student during an exam, as the time limit button on the assessment's Students tab does. It can also reopen closed attempts. To change the limit for students who have not started, edit the assessment's access rules in the course files instead.",
    requiredRole: ['Student Data Editor'],
    input: TimeLimitInputSchema,
    run: async ({ ctx, input }) => {
      const change = TIME_LIMIT_CHANGES[input.change];
      if (change.uses === 'minutes' && input.minutes === undefined) {
        throw new CourseActionError(`The change ${input.change} needs minutes.`);
      }
      if (change.uses === 'closing_time' && input.closing_time === undefined) {
        throw new CourseActionError('The change set_closing_time needs closing_time.');
      }
      const attempts = await selectAttempts(ctx, input.assessment_instance_ids);
      // updateAssessmentInstancesTimeLimit leaves closed attempts alone unless reopening them, and
      // only adds or subtracts time on attempts that have a limit.
      const reopenable = attempts.filter(
        (attempt) => attempt.open === true || input.reopen_closed === true,
      );
      const changing = reopenable.filter(
        (attempt) => change.base_time !== 'date_limit' || attempt.date_limit !== null,
      );
      if (changing.length === 0) {
        throw new CourseActionError(
          reopenable.length === 0
            ? `${attempts.length === 1 ? 'This attempt is' : 'These attempts are'} closed, so the change does nothing. Set reopen_closed to reopen ${attempts.length === 1 ? 'it' : 'them'}.`
            : `${reopenable.length === 1 ? 'This attempt has' : 'These attempts have'} no time limit to add to or subtract from. Use set_remaining_minutes or set_total_minutes instead.`,
        );
      }
      await updateAssessmentInstancesTimeLimit({
        assessment_id: ctx.assessment.id,
        assessment_instance_ids: changing.map((attempt) => attempt.id),
        base_time: change.base_time,
        time_add: change.sign * (input.minutes ?? 0),
        exact_date:
          input.closing_time === undefined
            ? new Date()
            : // As on the Students tab, a time repeated when clocks go back is read as the later one.
              parseLocalDateTime(input.closing_time, ctx.course_instance.display_timezone),
        reopen_closed: input.reopen_closed === true,
        authn_user_id: ctx.user.id,
      });
      const reopened = changing.filter((attempt) => attempt.open !== true).length;
      const unchanged = attempts.length - changing.length;
      return {
        summary: [
          `Changed the time limit on ${count(changing.length, 'attempt')}`,
          reopened > 0 ? `, reopening ${reopened} that had closed` : '',
          unchanged > 0
            ? `, and left ${count(unchanged, 'attempt')} as ${unchanged === 1 ? 'it was' : 'they were'}`
            : '',
          '.',
        ].join(''),
      };
    },
  }),
  assessment_instances_set_score: assessmentAction({
    description:
      "Set the total score of one attempt, as editing the total on the attempt's page does, such as to excuse a student. Later grading in the attempt recalculates the total and replaces it. To change one question's score, use instance_questions_set_score.",
    requiredRole: ['Student Data Editor'],
    input: SetAttemptScoreInputSchema,
    run: async ({ ctx, input }) => {
      const [attempt] = await selectAttempts(ctx, [input.assessment_instance_id]);
      if (input.score_perc !== undefined && input.points === undefined) {
        await setAssessmentInstanceScore(attempt.id, input.score_perc, ctx.user.id);
      } else if (input.points !== undefined && input.score_perc === undefined) {
        await setAssessmentInstancePoints(attempt.id, input.points, ctx.user.id);
      } else {
        throw new CourseActionError('Give either score_perc or points.');
      }
      await ltiOutcomes.updateScore(attempt.id);
      const updated = await selectAssessmentInstanceById(attempt.id);
      return {
        summary: `Set the attempt's total score to ${round(updated.score_perc)}% (${round(updated.points)} of ${round(updated.max_points)} points), which was ${round(attempt.score_perc)}%.`,
      };
    },
  }),
  instance_questions_set_score: assessmentAction({
    description:
      "Set the score of one question in one student's attempt, as editing its points on the attempt's page or grading it on the manual grading page does, optionally with feedback for the student. The attempt's total is recalculated and the question leaves the manual grading queue. Setting the manual points replaces any rubric grading of the question.",
    requiredRole: ['Student Data Editor'],
    input: SetQuestionScoreInputSchema,
    run: async ({ ctx, input }) => {
      checkOneScore(input);
      const [question] = await selectQuestions(ctx, [input.instance_question_id]);
      const { grading_job_id } = await updateInstanceQuestionScore({
        assessment: ctx.assessment,
        instance_question_id: question.instance_question.id,
        submission_id: null,
        // The course data has no modification time for the agent to pass back, so this applies the
        // score as the attempt page does when it is not given one.
        check_modified_at: null,
        score: {
          points: input.points,
          score_perc: input.score_perc,
          manual_points: input.manual_points,
          manual_score_perc: input.manual_score_perc,
          auto_points: input.auto_points,
          auto_score_perc: input.auto_score_perc,
          feedback: input.feedback === undefined ? undefined : { manual: input.feedback },
        },
        authn_user_id: ctx.user.id,
      });
      // Feedback is kept with a submission, so without one it would be silently dropped.
      if (input.feedback !== undefined && grading_job_id === null) {
        throw new CourseActionError(
          'This question has no submission to attach feedback to. Set the score without feedback.',
        );
      }
      const [{ instance_question: updated, assessment_question }] = await selectQuestions(ctx, [
        question.instance_question.id,
      ]);
      return {
        summary: `Set the question's score to ${round(updated.points)} of ${round(assessment_question.max_points)} points (${round(updated.auto_points)} automatic, ${round(updated.manual_points)} manual), which was ${round(question.instance_question.points)}${input.feedback === undefined ? '' : ', and left feedback'}.`,
      };
    },
  }),
  instance_questions_assign_grader: assessmentAction({
    description:
      'Assign a staff member to grade questions in attempts, or remove the assigned grader, as the manual grading page does. The grader needs Student Data Editor access to the course instance. This does not grade anything or change scores.',
    requiredRole: ['Student Data Editor'],
    input: AssignGraderInputSchema,
    run: async ({ ctx, input }) => {
      const { grader_user_id, grader_uid } = input;
      if ((grader_user_id === undefined) === (grader_uid === undefined)) {
        throw new CourseActionError('Give either grader_user_id or grader_uid.');
      }
      const questions = await selectQuestions(ctx, input.instance_question_ids);
      let graderId: string | null = null;
      if (grader_user_id !== null) {
        const graders = await selectCourseInstanceGraderStaff({
          courseInstance: ctx.course_instance,
        });
        const grader = graders.find((staff) =>
          grader_user_id === undefined
            ? staff.uid === grader_uid
            : idsEqual(staff.id, grader_user_id),
        );
        if (!grader) {
          throw new CourseActionError(
            `That staff member cannot be assigned, because only staff with Student Data Editor access to the course instance "${ctx.course_instance.short_name}" can grade. The user IDs of those who can: ${graders.map(({ id }) => id).join(', ') || 'none'}. A course owner can grant access on the Staff page.`,
          );
        }
        graderId = grader.id;
      }
      // The manual grading page assigns graders one assessment question at a time.
      const byAssessmentQuestion = groupBy(
        questions,
        ({ assessment_question }) => assessment_question.id,
      );
      for (const group of Object.values(byAssessmentQuestion)) {
        await updateInstanceQuestions({
          assessment_question: group[0].assessment_question,
          instance_question_ids: group.map(({ instance_question }) => instance_question.id),
          update_requires_manual_grading: false,
          requires_manual_grading: null,
          update_assigned_grader: true,
          assigned_grader: graderId,
        });
      }
      return {
        summary:
          graderId === null
            ? `Removed the assigned grader from ${count(questions.length, 'question')}.`
            : `Assigned the grader to ${count(questions.length, 'question')}.`,
      };
    },
  }),
};
