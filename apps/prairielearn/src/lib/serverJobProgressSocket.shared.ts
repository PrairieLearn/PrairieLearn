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

const JobItemStatusEnum = z.nativeEnum(JobItemStatus);

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
  item_statuses: z.record(z.string(), JobItemStatusEnum).optional(),
  /**
   * Running total cost in milli-dollars for AI grading jobs.
   * Only present when cost tracking is enabled (platform API keys).
   */
  total_cost_milli_dollars: z.number().nonnegative().optional(),
  /**
   * Number of submissions that were successfully graded and contributed to the total cost.
   * Used to compute average cost per submission on the frontend.
   */
  num_successfully_graded: z.number().int().nonnegative().optional(),
});

export type JobProgress = z.infer<typeof JobProgressSchema>;

/**
 * Progress update message sent from the server job progress socket.
 */
export const ProgressUpdateMessageSchema = z.discriminatedUnion('has_progress_data', [
  JobProgressSchema.extend({
    /** Progress data was available in the cache. */
    has_progress_data: z.literal(true),
  }),
  z.object({
    job_sequence_id: z.string(),
    /** No progress data was available in the cache. */
    has_progress_data: z.literal(false),
  }),
]);

export type ProgressUpdateMessage = z.infer<typeof ProgressUpdateMessageSchema>;
