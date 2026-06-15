import type { GradingJobStatus } from '../models/grading-job.js';

export interface StatusMessageSubmission {
  id: string;
  grading_job_id: string | null | undefined;
  grading_job_status: GradingJobStatus;
}

export interface StatusMessage {
  variant_id: string;
  submissions: StatusMessageSubmission[];
}
