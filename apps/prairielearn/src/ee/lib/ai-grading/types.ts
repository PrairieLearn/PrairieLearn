import type { RubricItem } from '../../../lib/db-types.js';

export interface AIGradingStats {
  last_human_grader: string | null;
  ai_grading_status: 'Graded' | 'LatestRubric' | 'OutdatedRubric' | 'None';
  point_difference: number | null;
  rubric_difference: (RubricItem & { false_positive: boolean })[] | null;
  rubric_similarity: (RubricItem & { true_positive: boolean })[] | null;
}

export type WithAIGradingStats<T> = T & AIGradingStats;

export interface AIGradingLog {
  messageType: 'info' | 'error';
  message: string;
}
