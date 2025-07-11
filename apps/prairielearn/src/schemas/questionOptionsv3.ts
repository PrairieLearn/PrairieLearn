import { z } from 'zod';

import { CommentJsonSchema } from './comment.js';

export const QuestionOptionsv3JsonSchema = z
  .looseObject({
    comment: CommentJsonSchema.optional(),
  })
  .describe('Options for a v3 question.');

export type QuestionOptionsv3Json = z.infer<typeof QuestionOptionsv3JsonSchema>;
