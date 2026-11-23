import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import { selectCreditPool } from '../../../../models/ai-grading-credit-pool.js';
import { selectOptionalAssessmentQuestionByQid } from '../../../../models/assessment-question.js';
import { selectInstanceQuestionSummariesByIds } from '../../../../models/instance-question.js';
import { selectQuestionById } from '../../../../models/question.js';
import {
  AI_GRADING_MODEL_IDS,
  DEFAULT_AI_GRADING_MODEL,
} from '../../ai-grading/ai-grading-models.shared.js';
import {
  countAiGradingJobsForJobSequence,
  selectInstanceQuestionsForAssessmentQuestion,
} from '../../ai-grading/ai-grading-util.js';
import { aiGrade } from '../../ai-grading/ai-grading.js';

import {
  ASSESSMENT_INPUT,
  type AssessmentActionContext,
  CourseActionError,
  assessmentAction,
  count,
} from './action.js';

const AiGradeInputSchema = z.strictObject({
  ...ASSESSMENT_INPUT,
  qid: z
    .string()
    .min(1)
    .describe(
      "The question's directory within the course's questions/ directory, which is qid in course data. The assessment must give it manual points.",
    ),
  which: z
    .enum(['waiting', 'all'])
    .optional()
    .describe(
      'waiting, the default: only answers still waiting for manual grading. all: every answered question, including ones staff already graded; AI grading changes the score only of those still waiting.',
    ),
  instance_question_ids: z
    .array(IdSchema)
    .min(1)
    .max(1000)
    .optional()
    .describe(
      'Grade only these questions in attempts, from the id column of the instance_questions dataset. Use instead of which.',
    ),
  model: z
    .enum(AI_GRADING_MODEL_IDS as [string, ...string[]])
    .optional()
    .describe(`The model to grade with. Leave it out to use ${DEFAULT_AI_GRADING_MODEL}.`),
});

type AiGradeInput = z.infer<typeof AiGradeInputSchema>;

const formatDollars = (milliDollars: number) => `$${(milliDollars / 1000).toFixed(2)}`;

/** What approving would grade, or an error the agent can act on. */
async function planAiGrading(ctx: AssessmentActionContext, input: AiGradeInput) {
  if (input.which && input.instance_question_ids) {
    throw new CourseActionError('Give which or instance_question_ids, not both.');
  }
  const assessment_question = await selectOptionalAssessmentQuestionByQid({
    assessment_id: ctx.assessment.id,
    qid: input.qid,
  });
  if (!assessment_question) {
    throw new CourseActionError(
      `The assessment "${ctx.assessment.tid}" has no question "${input.qid}". Use a qid from its infoAssessment.json.`,
    );
  }
  if (!assessment_question.max_manual_points) {
    throw new CourseActionError(
      `"${input.qid}" has no manual points on "${ctx.assessment.tid}", so AI grading has nothing to grade. Give it manualPoints in infoAssessment.json first.`,
    );
  }
  // Courses that bring their own API keys pay for their own use; the rest spend credits.
  let credits: number | null = null;
  if (!ctx.course_instance.ai_grading_use_custom_api_keys) {
    credits = (await selectCreditPool(ctx.course_instance.id)).total_milli_dollars;
    if (credits <= 0) {
      throw new CourseActionError(
        `The course instance "${ctx.course_instance.short_name}" has no AI grading credits left. Tell the instructor they can add credits in the AI grading settings of the course instance, and do not retry until they have.`,
      );
    }
  }
  const answered = await selectInstanceQuestionsForAssessmentQuestion({
    assessment_question_id: assessment_question.id,
  });
  const selected = input.instance_question_ids
    ? answered.filter(({ id }) => input.instance_question_ids!.includes(id))
    : input.which === 'all'
      ? answered
      : answered.filter((instance_question) => instance_question.requires_manual_grading);
  if (input.instance_question_ids && selected.length < new Set(input.instance_question_ids).size) {
    throw new CourseActionError(
      `Some of those IDs are not answered questions of "${input.qid}" on "${ctx.assessment.tid}". Find them in the instance_questions dataset, filtered by assessment_tid and qid, with status other than unanswered.`,
    );
  }
  if (selected.length === 0) {
    throw new CourseActionError(
      input.which === 'all' || input.instance_question_ids
        ? `No student has answered "${input.qid}" on "${ctx.assessment.tid}" yet, so there is nothing to grade.`
        : `No answer to "${input.qid}" on "${ctx.assessment.tid}" is waiting for manual grading. To regrade answers staff already graded, set which to all.`,
    );
  }
  const summaries = await selectInstanceQuestionSummariesByIds({
    assessment_id: ctx.assessment.id,
    instance_question_ids: selected.map(({ id }) => id),
  });
  return {
    assessment_question,
    model: input.model ?? DEFAULT_AI_GRADING_MODEL,
    mode: input.instance_question_ids
      ? ('selected' as const)
      : input.which === 'all'
        ? ('all' as const)
        : ('selected' as const),
    selected,
    summaries,
    credits,
  };
}

export const aiGradingActions = {
  instance_questions_ai_grade: assessmentAction({
    group: 'instance_questions',
    description:
      "Grade students' answers to one manually graded question with AI grading, which gives each a score and feedback, using the question's rubric when it has one. Grading runs in the background; when it finishes, read grading_jobs and ai_grading_jobs to see what it gave.",
    effects:
      'Each answer still waiting for manual grading gets a score and feedback, which students see as they would after manual grading. It spends AI grading credits unless the course instance uses its own API keys.',
    undo: "Change any score on the question's manual grading page. The AI gradings stay in the grading history.",
    permission: 'student_data_editor',
    feature: 'ai-grading',
    input: AiGradeInputSchema,
    describe: async ({ ctx, input }) => {
      const plan = await planAiGrading(ctx, input);
      return {
        title: `AI grade ${count(plan.selected.length, 'answer')} to ${input.qid}`,
        context: [
          `${ctx.assessment.title ?? ctx.assessment.tid} · ${ctx.course_instance.short_name}`,
          `Model: ${plan.model}`,
          plan.credits === null
            ? 'Uses your own API keys'
            : `Credits: ${formatDollars(plan.credits)}`,
        ].join(' · '),
        rows: plan.summaries.map((summary) => ({
          label: summary.group_name
            ? `Group ${summary.group_name}`
            : (summary.user_uid ?? 'Unknown user'),
          detail: summary.instance_question.requires_manual_grading
            ? 'Waiting for grading'
            : `Already graded: ${Number((summary.instance_question.points ?? 0).toFixed(2))} of ${summary.assessment_question.max_points ?? 0} points`,
        })),
      };
    },
    run: async ({ ctx, input }) => {
      const plan = await planAiGrading(ctx, input);
      try {
        return {
          jobSequenceId: await aiGrade({
            course: ctx.course,
            course_instance: ctx.course_instance,
            question: await selectQuestionById(plan.assessment_question.question_id),
            assessment: ctx.assessment,
            assessment_question: plan.assessment_question,
            // The links AI grading records point at the instructor's pages, which live under /pl.
            urlPrefix: `/pl/course_instance/${ctx.course_instance.id}/instructor`,
            authn_user_id: ctx.user.id,
            user_id: ctx.user.id,
            mode: plan.mode,
            instance_question_ids:
              plan.mode === 'selected' ? plan.selected.map(({ id }) => id) : undefined,
            model_id: plan.model,
          }),
        };
      } catch (error) {
        // Refusals such as the limit on concurrent AI grading jobs are written for staff.
        if (error instanceof HttpStatusError && error.status < 500) {
          throw new CourseActionError(error.message);
        }
        throw error;
      }
    },
    summarizeJob: async ({ jobSequenceId }) => {
      const graded = await countAiGradingJobsForJobSequence(jobSequenceId);
      return graded === 0
        ? 'AI grading finished without grading any answers.'
        : `AI graded ${count(graded, 'answer')}.`;
    },
  }),
};
