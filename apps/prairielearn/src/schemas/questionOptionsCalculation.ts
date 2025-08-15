import { z } from 'zod/v4';

import { CommentJsonSchema } from './comment.js';

export const QuestionCalculationOptionsJsonSchema = z
  .looseObject({
    comment: CommentJsonSchema.optional().describe(CommentJsonSchema.description!),
  })
  .describe('Options for a Calculation question.')
  .meta({
    title: 'Calculation question options',
  });

export type QuestionCalculationOptionsJson = z.infer<typeof QuestionCalculationOptionsJsonSchema>;
