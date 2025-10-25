import { z } from 'zod/v4';

import { CommentJsonSchema } from './comment.js';

export const QuestionFileOptionsJsonSchema = z
  .strictObject({
    comment: CommentJsonSchema.optional().describe(CommentJsonSchema.description!),
    fileName: z.string().describe('Filename of the file to download').optional(),
  })

  .describe('Options for a File question.')
  .meta({
    title: 'File question options',
  });

export type QuestionFileOptionsJson = z.infer<typeof QuestionFileOptionsJsonSchema>;
