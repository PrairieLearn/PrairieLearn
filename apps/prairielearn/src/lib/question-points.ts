import z from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import {
  type Assessment,
  type AssessmentQuestion,
  AssessmentQuestionSchema,
  AssessmentSchema,
  type InstanceQuestion,
  InstanceQuestionSchema,
} from './db-types.js';
import { insertIssue } from './issues.js';

const sql = loadSqlEquiv(import.meta.url);

type InstanceQuestionsPoints = Pick<
  InstanceQuestion,
  | 'open'
  | 'status'
  | 'auto_points'
  | 'highest_submission_score'
  | 'current_value'
  | 'points_list'
  | 'variants_points_list'
>;

export async function updateInstanceQuestionGrade({
  variant_id,
  instance_question_id,
  submissionScore,
  grading_job_id,
  authn_user_id,
}: {
  variant_id: string;
  instance_question_id: string;
  submissionScore: number;
  grading_job_id: string;
  authn_user_id: string | null;
}) {
  await runInTransactionAsync(async () => {
    const {
      assessment,
      instance_question: instanceQuestion,
      assessment_question: assessmentQuestion,
    } = await queryRow(
      sql.select_info_for_instance_question_grade,
      { instance_question_id },
      z.object({
        assessment: AssessmentSchema,
        instance_question: InstanceQuestionSchema,
        assessment_question: AssessmentQuestionSchema,
      }),
    );

    if (!instanceQuestion.open) {
      // This has been copied from legacy code. We should actually work to
      // prevent this from happening farther upstream, and avoid recording
      // an issue here.
      await insertIssue({
        variantId: variant_id,
        studentMessage: 'Submission received after instance question closed; grade not updated.',
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

    const computedPoints = run(() => {
      if (assessment.type === 'Exam') {
        return computeInstanceQuestionPointsExam({
          assessmentQuestion,
          instanceQuestion,
          submissionScore,
        });
      }
      if (assessment.type === 'Homework') {
        return computeInstanceQuestionPointsHomework({
          assessment,
          assessmentQuestion,
          instanceQuestion,
          submissionScore,
        });
      }
      throw new Error(`Unknown assessment type: ${assessment.type}`);
    });
    const points = (computedPoints.auto_points ?? 0) + (instanceQuestion.manual_points ?? 0);

    await execute(sql.update_instance_question_grade, {
      instance_question_id,
      ...computedPoints,
      points,
      score_perc: (points / (assessmentQuestion.max_points || 1)) * 100,
      max_auto_points: assessmentQuestion.max_auto_points,
      max_points: assessmentQuestion.max_points,
      grading_job_id,
      authn_user_id,
    });
    await updateInstanceQuestionStats({ instanceQuestion });
  });
}

function computeInstanceQuestionPointsExam({
  instanceQuestion,
  assessmentQuestion,
  submissionScore,
}: {
  instanceQuestion: InstanceQuestion;
  assessmentQuestion: AssessmentQuestion;
  submissionScore: number;
}): InstanceQuestionsPoints {
  const maxAutoPoints = assessmentQuestion.max_auto_points ?? 0;
  const maxManualPoints = assessmentQuestion.max_manual_points ?? 0;

  const correct = submissionScore >= 1;
  const currentAttemptWorth =
    (instanceQuestion.points_list_original?.at(instanceQuestion.number_attempts) ?? 0) -
    maxManualPoints;
  const eligibleScoreIncrease = Math.max(
    0,
    submissionScore - (instanceQuestion.highest_submission_score ?? 0),
  );

  const auto_points =
    correct && currentAttemptWorth === maxAutoPoints
      ? maxAutoPoints
      : (instanceQuestion.auto_points ?? 0) + currentAttemptWorth * eligibleScoreIncrease;
  const highest_submission_score = Math.max(
    instanceQuestion.highest_submission_score ?? 0,
    submissionScore,
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
        return { open: false, status: 'complete', current_value: null, points_list: [] };
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

function computeInstanceQuestionPointsHomework({
  assessment,
  instanceQuestion,
  assessmentQuestion,
  submissionScore,
}: {
  assessment: Assessment;
  instanceQuestion: InstanceQuestion;
  assessmentQuestion: AssessmentQuestion;
  submissionScore: number;
}): InstanceQuestionsPoints {
  const maxAutoPoints = assessmentQuestion.max_auto_points ?? 0;
  const maxManualPoints = assessmentQuestion.max_manual_points ?? 0;

  const highest_submission_score = Math.max(
    instanceQuestion.highest_submission_score ?? 0,
    submissionScore,
  );
  const correct = submissionScore >= 1;
  let current_value =
    (correct ? instanceQuestion.current_value : assessmentQuestion.init_points) ?? 0;

  const currentAutoValue = current_value - maxManualPoints;
  const baseAutoValue = (assessmentQuestion.init_points ?? 0) - maxManualPoints;

  const variants_points_list = instanceQuestion.variants_points_list.map((points) => points ?? 0);
  const variantPointsOld = variants_points_list.at(-1) ?? 0;
  const variantPointsNew = submissionScore * currentAutoValue;
  if (variants_points_list.length === 0 || variantPointsOld >= baseAutoValue) {
    // If this is the first submission, or if the old variant points already
    // reached got 100% of the auto points, append a new entry.
    variants_points_list.push(variantPointsNew);
  } else if (variantPointsNew > variantPointsOld) {
    // Otherwise, update the last entry only if the new points are higher.
    variants_points_list[variants_points_list.length - 1] = variantPointsNew;
  }

  if (correct && !assessment.constant_question_value) {
    current_value = Math.min(current_value + baseAutoValue, assessmentQuestion.max_points ?? 0);
  }

  const auto_points = Math.min(
    variants_points_list.reduce((sum, points) => sum + points, 0),
    maxAutoPoints,
  );
  const status = run(() => {
    // If the student has reached max auto points and there are no manual points, the question is complete.
    if (auto_points >= maxAutoPoints && maxManualPoints === 0) return 'complete';
    // If the student has reached 100% score in any variant, and the question is not yet complete, mark as correct.
    if (highest_submission_score >= 1 && instanceQuestion.status !== 'complete') return 'correct';
    // If the student has not yet achieved 100% score in any variant, mark as incorrect.
    return 'incorrect';
  });

  return {
    open: true,
    status,
    auto_points,
    highest_submission_score,
    current_value,
    points_list: null,
    variants_points_list,
  };
}

export async function updateInstanceQuestionStats({
  instanceQuestion,
}: {
  instanceQuestion: InstanceQuestion;
}) {
  const submissionScores = await queryRows(
    sql.select_submissions_for_stats,
    { instance_question_id: instanceQuestion.id },
    z.number(),
  );
  if (submissionScores.length === 0) {
    await execute(sql.update_instance_question_stats, {
      instance_question_id: instanceQuestion.id,
      some_submission: false,
      some_perfect_submission: false,
      some_nonzero_submission: false,
      first_submission_score: null,
      last_submission_score: null,
      max_submission_score: null,
      average_submission_score: null,
      submission_score_array: [],
      incremental_submission_score_array: [],
      incremental_submission_points_array:
        instanceQuestion.points_list_original === null ? null : [],
    });
    return;
  }

  let max_submission_score = 0;
  const incremental_submission_score_array = submissionScores.map((score) => {
    const increment = Math.max(score - max_submission_score, 0);
    if (score > max_submission_score) {
      max_submission_score = score;
    }
    return increment;
  });

  const incremental_submission_points_array =
    instanceQuestion.points_list_original === null
      ? null // This stat is not available if there's no points list (i.e., homework assessments).
      : incremental_submission_score_array.map(
          (score, index) => (instanceQuestion.points_list_original?.at(index) ?? 0) * score,
        );

  await execute(sql.update_instance_question_stats, {
    instance_question_id: instanceQuestion.id,
    some_submission: true,
    some_perfect_submission: max_submission_score >= 1,
    some_nonzero_submission: max_submission_score > 0,
    first_submission_score: submissionScores.at(0),
    last_submission_score: submissionScores.at(-1),
    max_submission_score,
    average_submission_score: submissionScores.reduce((a, b) => a + b, 0) / submissionScores.length,
    submission_score_array: submissionScores,
    incremental_submission_score_array,
    incremental_submission_points_array,
  });
}
