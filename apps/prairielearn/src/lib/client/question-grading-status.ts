import type { StatusMessageSubmission } from '../externalGradingSocket.types.js';

// Match gradingJobStatus: cancellation takes precedence over completion.
const statusOrder = { none: 0, requested: 1, queued: 2, grading: 3, graded: 4, canceled: 5 };

/** Database lookups and socket delivery can finish out of order. */
export function isStaleGradingStatus(
  incoming: StatusMessageSubmission,
  previous: StatusMessageSubmission | undefined,
): boolean {
  if (!previous) return false;
  // Empty DOM attributes and omitted socket fields both mean no grading job.
  const previousJobId = previous.grading_job_id || undefined;
  const jobId = incoming.grading_job_id || undefined;
  if (previousJobId !== jobId) {
    return !!previousJobId && (!jobId || BigInt(jobId) < BigInt(previousJobId));
  }
  return statusOrder[incoming.grading_job_status] < statusOrder[previous.grading_job_status];
}
