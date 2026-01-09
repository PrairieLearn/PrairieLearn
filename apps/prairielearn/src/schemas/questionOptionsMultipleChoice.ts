import { z } from 'zod';

import { CommentJsonSchema } from './comment.js';

export const QuestionOptionsMultipleChoiceJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
    text: z.string().describe('The question HTML text that comes before the options.'),
    correctAnswers: z
      .array(z.string())
      .min(1, 'At least one correct answer is required')
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

export type QuestionOptionsMultipleChoiceJson = z.infer<
  typeof QuestionOptionsMultipleChoiceJsonSchema
>;
