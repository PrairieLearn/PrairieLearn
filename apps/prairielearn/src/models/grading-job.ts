import z from 'zod';

import {
  callRow,
  execute,
  executeRow,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import {
  AssessmentQuestionSchema,
  AssessmentSchema,
  type GradingJob,
  GradingJobSchema,
  IdSchema,
  InstanceQuestionSchema,
  SprocAssessmentInstancesGradeSchema,
  type Submission,
  SubmissionSchema,
} from '../lib/db-types.js';
import { insertIssue } from '../lib/issues.js';

import { lockSubmission } from './submission.js';

const sql = loadSqlEquiv(import.meta.url);

export type GradingJobStatus = 'none' | 'canceled' | 'queued' | 'grading' | 'graded' | 'requested';

export function gradingJobStatus(gradingJob: GradingJob | null): GradingJobStatus {
  if (gradingJob == null) return 'none';
  if (gradingJob.grading_request_canceled_at != null) return 'canceled';
  if (gradingJob.graded_at != null) return 'graded';
  if (gradingJob.grading_received_at != null) return 'grading';
  if (gradingJob.grading_submitted_at != null) return 'queued';
  return 'requested';
}

const VariantForGradingJobUpdateSchema = z.object({
  credit: SubmissionSchema.shape.credit,
  variant_id: IdSchema,
  instance_question_id: IdSchema.nullable(),
  instance_question_open: z.boolean().nullable(),
  assessment_instance_id: IdSchema.nullable(),
  has_newer_submission: z.boolean(),
});

/**
 * Select a grading job by ID, returning null if it does not exist.
 *
 * @param grading_job_id The grading job ID.
 * @returns The grading job, or null if it does not exist.
 */
export async function selectOptionalGradingJobById(
  grading_job_id: string,
): Promise<GradingJob | null> {
  return await queryOptionalRow(sql.select_grading_job, { grading_job_id }, GradingJobSchema);
}

/**
 * Select a grading job by ID, throwing an error if it does not exist.
 *
 * @param grading_job_id The grading job ID.
 * @returns The grading job.
 */
export async function selectGradingJobById(grading_job_id: string): Promise<GradingJob> {
  return await queryRow(sql.select_grading_job, { grading_job_id }, GradingJobSchema);
}

export async function insertGradingJob({
  submission_id,
  authn_user_id,
}: {
  submission_id: string;
  authn_user_id: string | null;
}): Promise<GradingJob> {
  return await runInTransactionAsync(async () => {
    await lockSubmission({ submission_id });

    const { assessment_instance_id, credit, ...grading_job } = await queryRow(
      sql.insert_grading_job,
      { submission_id, authn_user_id },
      GradingJobSchema.extend({
        assessment_instance_id: IdSchema.nullable(),
        credit: SubmissionSchema.shape.credit,
      }),
    );
    if (assessment_instance_id != null) {
      await callRow(
        'assessment_instances_grade',
        [assessment_instance_id, authn_user_id, credit],
        SprocAssessmentInstancesGradeSchema,
      );
    }
    return grading_job;
  });
}

export async function updateGradingJobAfterGrading({
  grading_job_id,
  received_time,
  start_time,
  finish_time,
  submitted_answer,
  format_errors,
  gradable,
  broken,
  params,
  true_answer,
  feedback,
  partial_scores,
  score,
  v2_score,
}: {
  grading_job_id: string;
  /** null => no change */
  received_time?: Date | null;
  /** null => no change */
  start_time?: Date | null;
  /** null => now() */
  finish_time?: Date | null;
  /** null => no change */
  submitted_answer?: Submission['submitted_answer'] | null;
  format_errors?: Submission['format_errors'];
  gradable: Submission['gradable'];
  broken: Submission['broken'];
  /** null => no change */
  params?: Submission['params'] | null;
  /** null => no change */
  true_answer?: Submission['true_answer'] | null;
  feedback?: Submission['feedback'];
  partial_scores?: Submission['partial_scores'];
  score?: Submission['score'];
  v2_score?: Submission['v2_score'];
}): Promise<GradingJob> {
  return await runInTransactionAsync(async () => {
    const originalGradingJob = await selectGradingJobById(grading_job_id);
    await lockSubmission({ submission_id: originalGradingJob.submission_id });

    // Bail out if we don't need this grading result
    if (originalGradingJob.grading_request_canceled_at != null) return originalGradingJob;

    // Bail out if we've already done this grading. This could happen if the
    // message queues double-process a message, for example. This is not
    // involved in re-grading because we will make a separate grading_job for
    // re-grades.
    if (originalGradingJob.graded_at != null) return originalGradingJob;

    const {
      has_newer_submission,
      instance_question_id,
      instance_question_open,
      assessment_instance_id,
      variant_id,
      credit,
    } = await queryRow(
      sql.select_variant_for_grading_job_update,
      { submission_id: originalGradingJob.submission_id },
      VariantForGradingJobUpdateSchema,
    );

    // Bail out if there's a newer submission, regardless of grading status.
    // This only applies to student questions - that is, where there's an
    // associated instance question. This prevents a race condition where we
    // grade submissions in a different order than how they were saved.
    // This does not impact instructors since there's no notion of an assessment
    // to grade.
    if (has_newer_submission) return originalGradingJob;

    if (!gradable) {
      score = null;
      partial_scores = null;
    }

    const gradingJob = await queryRow(
      sql.update_grading_job_after_grading,
      {
        grading_job_id,
        submission_id: originalGradingJob.submission_id,
        gradable,
        broken,
        received_time,
        start_time,
        finish_time,
        params,
        true_answer,
        format_errors,
        partial_scores,
        score,
        v2_score,
        correct: gradable ? (score ?? 0) >= 1 : null,
        feedback,
        submitted_answer,
      },
      GradingJobSchema,
    );

    if (gradable) {
      await callRow('variants_update_after_grading', [variant_id, gradingJob.correct], z.unknown());
      if (instance_question_id != null && assessment_instance_id != null) {
        await updateInstanceQuestionGrade({
          variant_id,
          instance_question_id,
          instance_question_open: instance_question_open ?? false,
          submission_score: gradingJob.score ?? 0,
          grading_job_id,
          authn_user_id: gradingJob.auth_user_id,
        });
        await callRow(
          'assessment_instances_grade',
          [assessment_instance_id, gradingJob.auth_user_id, credit],
          SprocAssessmentInstancesGradeSchema,
        );
      }
    }

    return gradingJob;
  });
}

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

async function updateInstanceQuestionGrade({
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
