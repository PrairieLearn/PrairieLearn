import { z } from 'zod';

export interface StatusMessage {
    job_sequence_id: string;
    job_sequence_token: string;
}

export const JobItemStatusEnum = z.enum(['pending', 'in_progress', 'complete', 'failed']);

export type JobItemStatus = z.infer<typeof JobItemStatusEnum>;

export const StatusMessageWithProgressSchema = z.object({
    job_sequence_id: z.string(),
    /** 
     * True if the progress data was found in the cache, false otherwise.
     **/
    valid: z.boolean(),
    /**
     * Number of items completed, including failed items.
     */
    num_complete: z.number().int().nonnegative(),
    num_failed: z.number().int().nonnegative(),
    num_total: z.number().int().nonnegative(),
    item_statuses: z.record(z.string(), JobItemStatusEnum).optional()
})

export type StatusMessageWithProgress = z.infer<typeof StatusMessageWithProgressSchema>;