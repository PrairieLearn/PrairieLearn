import { z } from 'zod';

import { CommentSchema } from './comment.js';

export const QuestionOptionsv3Schema = z
  .object({
    comment: CommentSchema.optional(),
  })
  .describe('Options for a v3 question.');

export type QuestionOptionsv3 = z.infer<typeof QuestionOptionsv3Schema>;
