import { z } from 'zod';

import { CommentSchema } from './comment.js';

export const CalculationQuestionOptionsSchema = z
  .object({
    comment: CommentSchema.optional(),
  })
  .describe('Options for a Calculation question.');

export type CalculationQuestionOptions = z.infer<typeof CalculationQuestionOptionsSchema>;
