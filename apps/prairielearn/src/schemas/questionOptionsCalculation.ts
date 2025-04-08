import { z } from 'zod';

import { CommentJsonSchema } from './comment.js';

export const QuestionCalculationOptionsJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
  })
  .passthrough()
  .describe('Options for a Calculation question.');

export type QuestionCalculationOptionsJson = z.infer<typeof QuestionCalculationOptionsJsonSchema>;
