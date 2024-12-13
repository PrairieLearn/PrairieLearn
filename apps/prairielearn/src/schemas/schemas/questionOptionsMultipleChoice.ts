import { z } from 'zod';

export const schema = z
  .object({
    comment: z
      .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
      .describe('Arbitrary comment for reference purposes.')
      .optional(),
    text: z.string().describe('The question HTML text that comes before the options.'),
    correctAnswers: z
      .array(z.string())
      .describe('A list of correct answers to the question. Each is an HTML string.'),
    incorrectAnswers: z
      .array(z.string())
      .describe('A list of incorrect answers to the question. Each is an HTML string.'),
    numberAnswers: z
      .number()
      .int()
      .describe('The total number of answers in the list of possible answers.')
      .optional(),
  })
  .strict()
  .describe('Options for a MultipleChoice question.');
