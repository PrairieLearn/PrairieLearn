import z from 'zod';

import {
  callRow,
  execute,
  executeRow,
  loadSqlEquiv,
  queryRow,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import {
  type AssessmentQuestion,
  AssessmentQuestionSchema,
  AssessmentSchema,
  type InstanceQuestion,
  InstanceQuestionSchema,
} from './db-types.js';
import { insertIssue } from './issues.js';

const sql = loadSqlEquiv(import.meta.url);

const InstanceQuestionsPointsSchema = InstanceQuestionSchema.pick({
  open: true,
  status: true,
  auto_points: true,
  highest_submission_score: true,
  current_value: true,
  points_list: true,
  variants_points_list: true,
});
type InstanceQuestionsPoints = z.infer<typeof InstanceQuestionsPointsSchema>;

export async function updateInstanceQuestionGrade({
  variant_id,
  instance_question_id,
  instance_question_open,
  submission_score,
  grading_job_id,
  authn_user_id,
}: {
  variant_id: string;
  instance_question_id: string;
  instance_question_open: boolean;
  submission_score: number;
  grading_job_id: string;
  authn_user_id: string | null;
}) {
  await runInTransactionAsync(async () => {
    if (!instance_question_open) {
      // This has been copied from legacy code. We should actually work to
      // prevent this from happening farther upstream, and avoid recording
      // an issue here.
      await insertIssue({
        variantId: variant_id,
        studentMessage: 'Submission received after question closed; grade not updated.',
        instructorMessage: '',
        manuallyReported: false,
        courseCaused: false,
        courseData: { grading_job_id },
        systemData: {},
        userId: authn_user_id,
        authnUserId: authn_user_id,
      });
      return;
    }

    const { assessment_type, instance_question, assessment_question } = await queryRow(
      sql.select_type_and_points_for_instance_question,
      { instance_question_id },
      z.object({
        assessment_type: AssessmentSchema.shape.type,
        instance_question: InstanceQuestionSchema,
        assessment_question: AssessmentQuestionSchema,
      }),
    );

    const sprocName = run(() => {
      if (assessment_type === 'Exam') return 'instance_questions_points_exam';
      if (assessment_type === 'Homework') return 'instance_questions_points_homework';
      throw new Error(`Unknown assessment type: ${assessment_type}`);
    });

    const computedPoints = await callRow(
      sprocName,
      [instance_question_id, submission_score],
      InstanceQuestionsPointsSchema,
    );
    const points = (computedPoints.auto_points ?? 0) + (instance_question.manual_points ?? 0);
    const score_perc = (points / (assessment_question.max_points || 1)) * 100;

    await executeRow(sql.update_instance_question_grade, {
      instance_question_id,
      ...computedPoints,
      points,
      score_perc,
      max_points: assessment_question.max_points,
      grading_job_id,
      authn_user_id,
    });
    await updateInstanceQuestionStats(instance_question_id);
  });
}

export async function updateInstanceQuestionStats(instance_question_id: string) {
  await execute(sql.recalculate_instance_question_stats, { instance_question_id });
}

async function computeInstanceQuestionPointsExam({
  instanceQuestion,
  assessmentQuestion,
  submission_score,
}: {
  instanceQuestion: InstanceQuestion;
  assessmentQuestion: AssessmentQuestion;
  submission_score: number;
}): Promise<InstanceQuestionsPoints> {
  const maxAutoPoints = assessmentQuestion.max_auto_points ?? 0;
  const maxManualPoints = assessmentQuestion.max_manual_points ?? 0;

  const correct = submission_score >= 1;
  const currentAttemptWorth =
    (instanceQuestion.points_list_original?.at(instanceQuestion.number_attempts) ?? 0) -
    maxManualPoints;
  const eligibleScoreIncrease = Math.max(
    0,
    submission_score - (instanceQuestion.highest_submission_score ?? 0),
  );

  const auto_points =
    correct && currentAttemptWorth === maxAutoPoints
      ? maxAutoPoints
      : (instanceQuestion.auto_points ?? instanceQuestion.points ?? 0) +
        currentAttemptWorth * eligibleScoreIncrease;
  const highest_submission_score = Math.max(
    instanceQuestion.highest_submission_score ?? 0,
    submission_score,
  );

  return {
    auto_points,
    highest_submission_score,
    // exams don't use this, so just copy whatever was there before
    variants_points_list: instanceQuestion.variants_points_list,
    ...run(() => {
      // Decide if done or not and update points_list. If the answer is correct,
      // additional submissions are allowed only if there are manual points,
      // since students may wish to submit a new version that has better
      // potential for manual grading, but only if the points list has attempts
      // left.
      if ((correct && maxManualPoints === 0) || (instanceQuestion.points_list?.length ?? 0) <= 1) {
        return { open: false, status: 'complete', current_value: null, points_list: [] as const };
      }
      return {
        open: true,
        status: correct ? 'correct' : 'incorrect',
        current_value: instanceQuestion.points_list?.[0] ?? null,
        points_list:
          instanceQuestion.points_list_original
            ?.slice(instanceQuestion.number_attempts + 1)
            .map(
              (points) =>
                (points - maxManualPoints) * (1 - highest_submission_score) + maxManualPoints,
            ) ?? [],
      };
    }),
  };
}

async function computeInstanceQuestionPointsHomework({
  instanceQuestion,
  assessmentQuestion,
  submission_score,
}: {
  instanceQuestion: InstanceQuestion;
  assessmentQuestion: AssessmentQuestion;
  submission_score: number;
}): Promise<InstanceQuestionsPoints> {
  const maxAutoPoints = assessmentQuestion.max_auto_points ?? 0;
  const maxManualPoints = assessmentQuestion.max_manual_points ?? 0;

  const highest_submission_score = Math.max(
    instanceQuestion.highest_submission_score ?? 0,
    submission_score,
  );
  const open = true;
  const points_list = null;
  const correct = submission_score >= 1;
  const current_value =
    (correct ? instanceQuestion.current_value : assessmentQuestion.init_points) ?? 0;

  const current_auto_value = current_value - maxManualPoints;
  const init_auto_points = (assessmentQuestion.init_points ?? 0) - maxManualPoints;

  const variants_points_list = [...instanceQuestion.variants_points_list];
  const variantPointsOld = variants_points_list.at(-1) ?? 0;
  const variantPointsNew = submission_score * current_auto_value;
  if (variants_points_list.length === 0 || variantPointsOld >= init_auto_points) {
    variants_points_list.push(variantPointsNew);
  } else if (variantPointsNew > variantPointsOld) {
    variants_points_list[variants_points_list.length - 1] = variantPointsNew;
  }
}
