import { z } from 'zod';

import { CommentSchema } from './comment.js';

export const CheckboxQuestionOptionsSchema = z
  .object({
    comment: CommentSchema.optional(),
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
      .gte(1)
      .describe('The total number of answers in the list of possible answers.')
      .optional(),
    minCorrectAnswers: z
      .number()
      .int()
      .gte(0)
      .describe('The minimum number of correct answers in the list of possible answers.')
      .optional(),
    maxCorrectAnswers: z
      .number()
      .int()
      .gte(0)
      .describe('The maximum number of correct answers in the list of possible answers.')
      .optional(),
  })
  .strict()
  .describe('Options for a MultipleChoice question.');

export type CheckboxQuestionOptions = z.infer<typeof CheckboxQuestionOptionsSchema>;