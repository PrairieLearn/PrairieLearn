import { z } from 'zod';

import { CommentJsonSchema } from './comment.js';

export const QuestionOptionsFileJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
    fileName: z.string().describe('Filename of the file to download').optional(),
  })
  .strict()
  .describe('Options for a File question.')
  .meta({ title: 'File question options' });

export type QuestionOptionsFileJson = z.infer<typeof QuestionOptionsFileJsonSchema>;
