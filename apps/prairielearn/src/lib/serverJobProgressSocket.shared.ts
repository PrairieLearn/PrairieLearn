import { z } from 'zod';

export interface StatusMessage {
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

export const JobItemStatusEnum = z.nativeEnum(JobItemStatus);

export const StatusMessageWithProgressSchema = z.object({
  job_sequence_id: z.string(),
  /**
   * Number of items completed, including failed items.
   */
  num_complete: z.number().int().nonnegative(),
  num_failed: z.number().int().nonnegative(),
  num_total: z.number().int().nonnegative(),
  item_statuses: z.record(z.string(), JobItemStatusEnum).optional(),
});

export type StatusMessageWithProgress = z.infer<typeof StatusMessageWithProgressSchema>;

export const StatusMessageWithProgressValidSchema = z.discriminatedUnion('valid', [
  StatusMessageWithProgressSchema.extend(
    {
      job_sequence_id: z.string(),
      valid: z.literal(true)
    }
  ),
  z.object({
    /**
     * True if the progress data was found in the cache, false otherwise.
     */
    job_sequence_id: z.string(),
    valid: z.literal(false)
  })
])

export type StatusMessageWithProgressValid = z.infer<typeof StatusMessageWithProgressValidSchema>;