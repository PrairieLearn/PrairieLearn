import { z } from 'zod';

import { RubricItemSchema } from '../../../lib/db-types.js';

export const AIGradingStatsSchema = z.object({
  last_human_grader: z.string().nullable(),
  ai_grading_status: z.enum(['Graded', 'LatestRubric', 'OutdatedRubric', 'None']),
  point_difference: z.number().nullable(),
  rubric_difference: z.array(RubricItemSchema.extend({ false_positive: z.boolean() })).nullable(),
});

type AIGradingStats = z.infer<typeof AIGradingStatsSchema>;

export type WithAIGradingStats<T> = T & AIGradingStats;

export interface AIGradingLog {
  messageType: 'info' | 'error';
  message: string;
}

export interface AIGradingLogger {
  info(msg: string): void;
  error(msg: string): void;
}
