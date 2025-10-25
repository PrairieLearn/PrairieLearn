import { z } from 'zod/v4';

import { CommentJsonSchema } from './comment.js';

export const QuestionMultipleTrueFalseOptionsJsonSchema = z
  .strictObject({
    comment: CommentJsonSchema.optional().describe(CommentJsonSchema.description!),
    text: z.string().describe('Text to precede the set of statements being given.').optional(),
    trueStatements: z
      .array(z.string())
      .describe('A list of true statements for the question. Each is an HTML string.'),
    falseStatements: z
      .array(z.string())
      .describe('A list of false statements for the question. Each is an HTML string.'),
  })

  .describe('Options for a MultipleTrueFalse question.')
  .meta({
    title: 'MultipleTrueFalse question options',
  });

export type QuestionMultipleTrueFalseOptionsJson = z.infer<
  typeof QuestionMultipleTrueFalseOptionsJsonSchema
>;
