import { z } from 'zod';

import { CommentJsonSchema } from './comment.js';

export const QuestionOptionsMultipleTrueFalseJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
    text: z.string().describe('Text to precede the set of statements being given.').optional(),
    trueStatements: z
      .array(z.string())
      .describe('A list of true statements for the question. Each is an HTML string.'),
    falseStatements: z
      .array(z.string())
      .describe('A list of false statements for the question. Each is an HTML string.'),
  })
  .strict()
  .describe('Options for a MultipleTrueFalse question.');

export type QuestionOptionsMultipleTrueFalseJson = z.infer<
  typeof QuestionOptionsMultipleTrueFalseJsonSchema
>;
