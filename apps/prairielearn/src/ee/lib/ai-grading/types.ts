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
  /** Explanation from the LLM for AI grading */
  explanation: string | null;
  /** Stringified JSON of rotation degrees for each image, by filename. */
  rotationCorrectionDegrees: string | null;
}

const AIGradingOrientationSchema = z.enum([
  'Upright (0 degrees)',
  'Upside-down (180 degrees)',
  'Rotated Counterclockwise 90 degrees',
  'Rotated Clockwise 90 degrees',
]);

/**
 * Schema for an LLM to output handwriting orientations.
 *
 * Note: We classify each image into one of four orientations because doing so
 * outperformed simpler boolean classification (upright vs. not upright) in testing.
 */
export const HandwritingOrientationsOutputSchema = z.object({
  handwriting_orientations: z
    .array(AIGradingOrientationSchema)
    .describe(
      [
        'For each image provided, describe the orientation of its handwriting as upright, upside-down, rotated counterclockwise 90 degrees, or rotated clockwise 90 degrees.',
        'Upright (0 degrees): The handwriting is in a standard reading position already.',
        'Upside-down (180 degrees clockwise): The handwriting is completely upside down.',
        'Rotated Clockwise 90 degrees: The page is on its side, with the top of the text pointing left.',
        'Rotated Counterclockwise 90 degrees: The page is on its side, with the top of the text pointing right.',
        "Only use the student's handwriting to determine its orientation. Do not use the background or the page.",
      ].join(' '),
    ),
});

export const RotationCorrectionOutputSchema = z.object({
  upright_image: z
    .enum(['1', '2', '3', '4'])
    .describe('The number corresponding to the image that is closest to being upright.'),
});

export type CounterClockwiseRotationDegrees = 0 | 90 | 180 | 270;
