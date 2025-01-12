import { z } from 'zod';

import { CommentJsonSchema } from './comment.js';

export const CalculationQuestionOptionsJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
  })
  .describe('Options for a Calculation question.');

export type CalculationQuestionOptionsJson = z.infer<typeof CalculationQuestionOptionsJsonSchema>;
