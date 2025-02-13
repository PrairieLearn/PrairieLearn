import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { GradingJobSchema, type GradingJob } from '../lib/db-types.js';

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
