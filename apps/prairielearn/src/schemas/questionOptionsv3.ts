import { z } from 'zod/v4';

import { CommentJsonSchema } from './comment.js';

export const QuestionOptionsv3JsonSchema = z
  .looseObject({
    comment: CommentJsonSchema.optional().describe(CommentJsonSchema.description!),
  })
  .describe('Options for a v3 question.')
  .meta({
    title: 'v3 question options',
  });

export type QuestionOptionsv3Json = z.infer<typeof QuestionOptionsv3JsonSchema>;
