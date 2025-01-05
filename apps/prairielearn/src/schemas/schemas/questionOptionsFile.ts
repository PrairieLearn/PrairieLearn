import { z } from 'zod';

const FileQuestionOptionsSchema = z
  .object({
    comment: z
      .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
      .describe('Arbitrary comment for reference purposes.')
      .optional(),
    fileName: z.string().describe('Filename of the file to download').optional(),
  })
  .strict()
  .describe('Options for a File question.');

export { FileQuestionOptionsSchema };
