import { z } from 'zod/v4';

import { CommentJsonSchema } from './comment.js';

export const QuestionMultipleChoiceOptionsJsonSchema = z
  .strictObject({
    comment: CommentJsonSchema.optional().describe(CommentJsonSchema.description!),
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

  .describe('Options for a MultipleChoice question.')
  .meta({
    title: 'MultipleChoice question options',
  });

export type QuestionMultipleChoiceOptionsJson = z.infer<
  typeof QuestionMultipleChoiceOptionsJsonSchema
>;
