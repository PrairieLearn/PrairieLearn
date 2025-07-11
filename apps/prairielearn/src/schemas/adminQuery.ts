import { z } from 'zod';

import { CommentJsonSchema } from './comment.js';

export const AdminQueryJsonSchema = z
  .strictObject({
    comment: CommentJsonSchema.optional(),
    description: z.string().describe('Brief one-line description of the query.'),
    resultFormats: z
      .record(z.enum(['pre']))
      .describe('Custom formats for result columns.')
      .optional(),
    params: z
      .array(
        z.strictObject({
          comment: CommentJsonSchema.optional(),
          name: z.string().describe('Name of the parameter. Must match a $name in the SQL.'),
          description: z.string().describe('Brief one-line description of the parameter.'),
          default: z.string().describe('Default value.').optional(),
        }),
      )
      .describe('Parameters for the query.')
      .optional(),
  })

  .describe('Description of an administrator SQL query.');
