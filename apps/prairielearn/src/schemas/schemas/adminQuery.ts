import { z } from 'zod';

export const schema = z
  .object({
    comment: z
      .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
      .describe('Arbitrary comment for reference purposes.')
      .optional(),
    description: z.string().describe('Brief one-line description of the query.'),
    resultFormats: z
      .record(z.enum(['pre']))
      .describe('Custom formats for result columns.')
      .optional(),
    params: z
      .array(
        z
          .object({
            comment: z
              .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
              .describe('Arbitrary comment for reference purposes.')
              .optional(),
            name: z.string().describe('Name of the parameter. Must match a $name in the SQL.'),
            description: z.string().describe('Brief one-line description of the parameter.'),
            default: z.string().describe('Default value.').optional(),
          })
          .strict(),
      )
      .describe('Parameters for the query.')
      .optional(),
  })
  .strict()
  .describe('Description of an administrator SQL query.');
