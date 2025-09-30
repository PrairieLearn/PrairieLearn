import {
  callRow,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  type GradingJob,
  GradingJobSchema,
  IdSchema,
  SprocAssessmentInstancesGradeSchema,
  type Submission,
  SubmissionSchema,
} from '../lib/db-types.js';

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
    const grading_job = await selectGradingJobById(grading_job_id);
    await lockSubmission({ submission_id: grading_job.submission_id });
    return await callRow(
      'grading_jobs_update_after_grading',
      [
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
      ],
      GradingJobSchema,
    );
  });
}
