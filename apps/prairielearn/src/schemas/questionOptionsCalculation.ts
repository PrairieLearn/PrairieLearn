import { z } from 'zod';

import { CommentJsonSchema } from './comment.js';

export const QuestionOptionsCalculationJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
  })
  .loose()
  .describe('Options for a Calculation question.')
  .meta({ title: 'Calculation question options' });

export type QuestionOptionsCalculationJson = z.infer<typeof QuestionOptionsCalculationJsonSchema>;
