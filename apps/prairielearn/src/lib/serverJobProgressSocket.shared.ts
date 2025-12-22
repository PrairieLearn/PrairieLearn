import { z } from 'zod';

export interface StatusMessage {
    job_sequence_id: string;
}

export const StatusMessageWithProgressSchema = z.object({
    job_sequence_id: z.string(),
    num_complete: z.number().int().nonnegative(),
    num_total: z.number().int().nonnegative(),
    item_statuses: z.record(z.string(), z.enum(['pending', 'in_progress', 'complete', 'failed'])).optional()
})

export type StatusMessageWithProgress = z.infer<typeof StatusMessageWithProgressSchema>;