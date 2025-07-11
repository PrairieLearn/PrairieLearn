import { z } from 'zod';

import { CommentJsonSchema } from './comment.js';

export const QuestionCalculationOptionsJsonSchema = z
  .looseObject({
    comment: CommentJsonSchema.optional(),
  })
  .describe('Options for a Calculation question.');

export type QuestionCalculationOptionsJson = z.infer<typeof QuestionCalculationOptionsJsonSchema>;
