import { z } from 'zod';

import { CommentSchema } from './comment.js';

export const NewsItemSchema = z
  .object({
    comment: CommentSchema.optional(),
    uuid: z
      .string()
      .regex(
        new RegExp('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
      )
      .describe('Unique identifier (UUID v4).'),
    title: z.string().describe('The title of the news item.'),
    author: z.string().describe('The author of the news item.').optional(),
    visible_to_students: z.boolean().describe('Whether the news item should be shown to students.'),
  })
  .strict()
  .describe('Info files for news items.');

export type NewsItem = z.infer<typeof NewsItemSchema>;
