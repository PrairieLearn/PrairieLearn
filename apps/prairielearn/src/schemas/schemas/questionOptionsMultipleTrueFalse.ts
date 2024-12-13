import { z } from 'zod';

export const schema = z
  .object({
    comment: z
      .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
      .describe('Arbitrary comment for reference purposes.')
      .optional(),
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
