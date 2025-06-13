import { z } from 'zod';

import { CommentJsonSchema } from './comment.js';

export const QuestionOptionsv3JsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
  })
  .passthrough()
  .describe('Options for a v3 question.');

export type QuestionOptionsv3Json = z.infer<typeof QuestionOptionsv3JsonSchema>;
