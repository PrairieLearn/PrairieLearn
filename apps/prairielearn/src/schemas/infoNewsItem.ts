import { z } from 'zod/v4';

import { CommentJsonSchema } from './comment.js';

export const NewsItemJsonSchema = z
  .strictObject({
    comment: CommentJsonSchema.optional().describe(CommentJsonSchema.description!),
    uuid: z
      .string()
      .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)
      .describe('Unique identifier (UUID v4).'),
    title: z.string().describe('The title of the news item.'),
    author: z.string().describe('The author of the news item.').optional(),
    visible_to_students: z.boolean().describe('Whether the news item should be shown to students.'),
  })

  .describe('Info files for news items.')
  .meta({
    title: 'News Item Info',
  });

export type NewsItemJson = z.infer<typeof NewsItemJsonSchema>;
