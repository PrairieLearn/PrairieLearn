import { z } from 'zod';

import { CommentSchema } from './comment.js';

export const FileQuestionOptionsSchema = z
  .object({
    comment: CommentSchema.optional(),
    fileName: z.string().describe('Filename of the file to download').optional(),
  })
  .strict()
  .describe('Options for a File question.');

export type FileQuestionOptions = z.infer<typeof FileQuestionOptionsSchema>;
