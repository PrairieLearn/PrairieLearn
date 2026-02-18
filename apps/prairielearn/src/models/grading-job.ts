import z from 'zod';

import {
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { updateAssessmentInstanceGrade } from '../lib/assessment-grading.js';
import {
  type GradingJob,
  GradingJobSchema,
  type Submission,
  SubmissionSchema,
} from '../lib/db-types.js';
import { updateInstanceQuestionGrade } from '../lib/question-points.js';

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
async function selectGradingJobById(grading_job_id: string): Promise<GradingJob> {
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
      await updateAssessmentInstanceGrade({ assessment_instance_id, authn_user_id, credit });
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
  submitted_answer?: Submission['submitted_answer'];
  format_errors?: Submission['format_errors'];
  gradable: Submission['gradable'];
  broken: Submission['broken'];
  /** null => no change */
  params?: Submission['params'];
  /** null => no change */
  true_answer?: Submission['true_answer'];
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

    if (gradable && instance_question_id != null && assessment_instance_id != null) {
      await updateInstanceQuestionGrade({
        variant_id,
        instance_question_id,
        submissionScore: gradingJob.score ?? 0,
        grading_job_id,
        authn_user_id: gradingJob.auth_user_id,
      });
      await updateAssessmentInstanceGrade({
        assessment_instance_id,
        authn_user_id: gradingJob.auth_user_id,
        credit,
      });
    }

    return gradingJob;
  });
}
