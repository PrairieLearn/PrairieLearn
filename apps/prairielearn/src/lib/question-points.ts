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

import { AssessmentQuestionSchema, AssessmentSchema, InstanceQuestionSchema } from './db-types.js';
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
}).extend({
  max_auto_points: AssessmentQuestionSchema.shape.max_auto_points,
});

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

    const { assessment_type, manual_points, max_points } = await queryRow(
      sql.select_type_and_points_for_instance_question,
      { instance_question_id },
      z.object({
        assessment_type: AssessmentSchema.shape.type,
        manual_points: InstanceQuestionSchema.shape.manual_points,
        max_points: AssessmentQuestionSchema.shape.max_points,
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
    const points = (computedPoints.auto_points ?? 0) + (manual_points ?? 0);
    const score_perc = (points / (max_points ?? 1)) * 100;

    await executeRow(sql.update_instance_question_grade, {
      instance_question_id,
      ...computedPoints,
      points,
      score_perc,
      max_points,
      grading_job_id,
      authn_user_id,
    });
    await updateInstanceQuestionStats(instance_question_id);
  });
}

export async function updateInstanceQuestionStats(instance_question_id: string) {
  await execute(sql.recalculate_instance_question_stats, { instance_question_id });
}
