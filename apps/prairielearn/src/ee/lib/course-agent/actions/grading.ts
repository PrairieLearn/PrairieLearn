import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { updateInstanceQuestionScore } from '../../../../lib/manualGrading.js';
import {
  type InstanceQuestionSummary,
  selectInstanceQuestionSummariesByIds,
} from '../../../../models/instance-question.js';

import {
  ASSESSMENT_INPUT,
  type AssessmentActionContext,
  CourseActionError,
  assessmentAction,
  count,
} from './action.js';

const INSTANCE_QUESTION_ID =
  'from the id column of the instance_questions dataset, filtered by assessment_tid. Find whose attempt it is by joining assessment_instance_id to the assessment_instances dataset.';

/** The assessment's instance questions, in the order asked, or an error the agent can act on. */
async function selectQuestions(ctx: AssessmentActionContext, instanceQuestionIds: string[]) {
  const ids = [...new Set(instanceQuestionIds)];
  const rows = await selectInstanceQuestionSummariesByIds({
    assessment_id: ctx.assessment.id,
    instance_question_ids: ids,
  });
  const byId = new Map(rows.map((row) => [row.instance_question.id, row]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new CourseActionError(
      `The assessment "${ctx.assessment.tid}" has no instance question with ID ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ', …' : ''}. Find the IDs in the instance_questions dataset, filtered by assessment_tid.`,
    );
  }
  return ids.map((id) => byId.get(id)!);
}

/** Whose attempt the question is in, as staff name students. */
const who = (row: InstanceQuestionSummary) =>
  row.group_name ? `Group ${row.group_name}` : (row.user_uid ?? 'Unknown user');

const where = (ctx: AssessmentActionContext) =>
  `${ctx.assessment.title ?? ctx.assessment.tid} · ${ctx.course_instance.short_name}`;

const number = (value: number | null) => Number((value ?? 0).toFixed(2));

const currentScore = ({ instance_question, assessment_question }: InstanceQuestionSummary) =>
  `${number(instance_question.points)} of ${number(assessment_question.max_points)} points (${number(instance_question.auto_points)} from automatic grading, ${number(instance_question.manual_points)} from manual grading)`;

const PointsSchema = z.number().min(-100_000).max(100_000);

const SetQuestionScoreInputSchema = z.strictObject({
  ...ASSESSMENT_INPUT,
  instance_question_id: IdSchema.describe(
    `ID of the question in the attempt, ${INSTANCE_QUESTION_ID}`,
  ),
  points: PointsSchema.optional().describe(
    'The new total points for the question. Automatic points stay as they are and manual points make up the difference.',
  ),
  score_perc: z
    .number()
    .min(0)
    .max(1000)
    .optional()
    .describe(
      "The new total score as a percentage of the question's maximum points, from 0 to 100 or more for extra credit. Use instead of points.",
    ),
  manual_points: PointsSchema.optional().describe(
    'The new points from manual grading alone. Use this, auto_points, or both instead of points to set one part without changing the other.',
  ),
  auto_points: PointsSchema.optional().describe('The new points from automatic grading alone.'),
});

type SetQuestionScoreInput = z.infer<typeof SetQuestionScoreInputSchema>;

/** The new score as the instructor would say it, or an error when the request mixes ways of setting it. */
function newScore(input: SetQuestionScoreInput) {
  const parts = input.manual_points !== undefined || input.auto_points !== undefined;
  const ways = [input.points !== undefined, input.score_perc !== undefined, parts].filter(Boolean);
  if (ways.length !== 1) {
    throw new CourseActionError(
      'Set the score one way: points, or score_perc, or manual_points and auto_points.',
    );
  }
  if (input.points !== undefined) return `${count(input.points, 'point')} in total`;
  if (input.score_perc !== undefined) return `${input.score_perc}% in total`;
  return [
    input.auto_points === undefined
      ? null
      : `${count(input.auto_points, 'point')} from automatic grading`,
    input.manual_points === undefined
      ? null
      : `${count(input.manual_points, 'point')} from manual grading`,
  ]
    .filter(Boolean)
    .join(', ');
}

export const gradingActions = {
  instance_questions_set_score: assessmentAction({
    group: 'instance_questions',
    description:
      "Set the score on one question in one student's attempt, overriding what grading gave it, such as to give credit for an answer the grader got wrong. To set the total score of a whole attempt instead, use assessment_instances_set_score.",
    effects:
      "The student sees the new score on the question, the attempt's total is recalculated, and the question leaves the manual grading queue.",
    undo: 'Set the earlier score again. The request shows it.',
    permission: 'student_data_editor',
    input: SetQuestionScoreInputSchema,
    describe: async ({ ctx, input }) => {
      const score = newScore(input);
      const [question] = await selectQuestions(ctx, [input.instance_question_id]);
      return {
        title: `Set the score on ${question.qid} for ${who(question)}`,
        context: where(ctx),
        rows: [
          { label: 'Now', detail: currentScore(question) },
          { label: 'New', detail: score },
        ],
      };
    },
    run: async ({ ctx, input }) => {
      newScore(input);
      const [question] = await selectQuestions(ctx, [input.instance_question_id]);
      await updateInstanceQuestionScore({
        assessment: ctx.assessment,
        instance_question_id: question.instance_question.id,
        submission_id: null,
        check_modified_at: null,
        score: {
          points: input.points,
          score_perc: input.score_perc,
          manual_points: input.manual_points,
          auto_points: input.auto_points,
        },
        authn_user_id: ctx.user.id,
      });
      const [updated] = await selectQuestions(ctx, [input.instance_question_id]);
      return {
        summary: `Set the score on ${updated.qid} for ${who(updated)}, which was ${currentScore(question)} and is now ${currentScore(updated)}.`,
      };
    },
  }),
};
