import { z } from 'zod';

export interface ClientConnectMessage {
  job_sequence_id: string;
  job_sequence_token: string;
}

/**
 * Status of an individual item within a server job.
 * Ordered by progression (queued < in_progress < failed < complete).
 */
export enum JobItemStatus {
  queued,
  in_progress,
  failed,
  complete,
}

const JobItemStatusEnum = z.enum(JobItemStatus);

/**
 * Describes the overall progress of a server job.
 */
export const JobProgressSchema = z.object({
  job_sequence_id: z.string(),
  /**
   * Number of items completed, including failed items.
   */
  num_complete: z.number().int().nonnegative(),
  num_failed: z.number().int().nonnegative(),
  num_total: z.number().int().nonnegative(),
  /**
   * Optional failure message for the job as a whole.
   * Displayed if num_failed > 0.
   */
  job_failure_message: z.string().optional(),
  /**
   * Optional supplemental failure detail. Rendered as a secondary line
   * underneath the banner's main row when present and num_failed > 0. Use
   * for surfacing a representative per-item failure cause; the run-level
   * `job_failure_message` (which replaces the header) is still the right
   * slot for batch-level fatal reasons (rate limit, credit exhaustion).
   */
  job_failure_detail: z.string().optional(),
  item_statuses: z.record(z.string(), JobItemStatusEnum).optional(),
  /**
   * Optional cost tracking for the server job. When `total_cost_milli_dollars`
   * is present, the total cost is displayed. When `num_items_incurred_cost` is
   * also present, an average cost per item is displayed alongside the total.
   */
  total_cost_milli_dollars: z.number().nonnegative().optional(),
  /**
   * Number of items that incurred cost. This may differ from `num_complete`
   * because some items may incur cost before failing (e.g. an API call
   * succeeds but subsequent persistence fails).
   */
  num_items_incurred_cost: z.number().int().nonnegative().optional(),
  /** Cancellation state; absent means the job is not being stopped. */
  stop_state: z.enum(['stopping', 'stopped']).optional(),
});

export type JobProgress = z.infer<typeof JobProgressSchema>;

export type JobStatus = 'inProgress' | 'stopping' | 'stopped' | 'complete' | 'failed';

export function deriveJobStatus(progress: JobProgress): JobStatus {
  if (progress.stop_state === 'stopped') return 'stopped';
  if (progress.num_total > 0 && progress.num_complete >= progress.num_total) {
    return progress.num_failed > 0 ? 'failed' : 'complete';
  }
  if (progress.stop_state === 'stopping') return 'stopping';
  return 'inProgress';
}

/**
 * Progress update message sent from the server job progress socket.
 */
export type ProgressUpdateMessage =
  | (JobProgress & {
      /** Progress data was available in the cache. */
      has_progress_data: true;
    })
  | {
      job_sequence_id: string;
      /** No progress data was available in the cache. */
      has_progress_data: false;
    };
