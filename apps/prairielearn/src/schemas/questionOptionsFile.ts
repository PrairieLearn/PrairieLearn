import { z } from 'zod';

import { CommentJsonSchema } from './comment.js';

export const QuestionFileOptionsJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
    fileName: z.string().describe('Filename of the file to download').optional(),
  })
  .strict()
  .describe('Options for a File question.');

export type QuestionFileOptionsJson = z.infer<typeof QuestionFileOptionsJsonSchema>;
