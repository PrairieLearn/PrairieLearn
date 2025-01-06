import { z } from 'zod';

export const QuestionOptionsv3Schema = z
  .object({
    comment: z
      .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
      .describe('Arbitrary comment for reference purposes.')
      .optional(),
  })
  .describe('Options for a v3 question.');

export type QuestionOptionsv3 = z.infer<typeof QuestionOptionsv3Schema>;
