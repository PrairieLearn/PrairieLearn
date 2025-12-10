import { z } from 'zod';

import { CommentJsonSchema } from './comment.js';

export const QuestionOptionsCalculationJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
  })
  .passthrough()
  .describe('Options for a Calculation question.');

export type QuestionOptionsCalculationJson = z.infer<typeof QuestionOptionsCalculationJsonSchema>;
