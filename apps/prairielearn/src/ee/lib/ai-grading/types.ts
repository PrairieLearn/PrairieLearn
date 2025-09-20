import { z } from 'zod';

import { RubricItemSchema } from '../../../lib/db-types.js';

export const AIGradingStatsSchema = z.object({
  last_human_grader: z.string().nullable(),
  ai_grading_status: z.enum(['Graded', 'LatestRubric', 'OutdatedRubric', 'None']),
  point_difference: z.number().nullable(),
  rubric_difference: z.array(RubricItemSchema.extend({ false_positive: z.boolean() })).nullable(),
  rubric_similarity: z.array(RubricItemSchema.extend({ true_positive: z.boolean() })).nullable(),
  instance_question_group_name: z.string().nullable(),
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

export interface AiGradingGeneralStats {
  submission_point_count: number;
  submission_rubric_count: number;
  mean_error: number | null;
  /** Mapping from rubric item id to disagreement count */
  rubric_stats: Record<string, number>;
}

export interface InstanceQuestionAIGradingInfo {
  /** If the submission was also manually graded. */
  submissionManuallyGraded: boolean;
  /** The IDs of the rubric items selected by the AI grader. */
  selectedRubricItemIds: string[];
  /** The raw prompt sent to the LLM for AI grading.  */
  prompt: string;
  /** Images that were sent in the prompt. */
  promptImageUrls: string[];
  /** Explanation from the LLM for AI grading */
  explanation: string | null;
}
