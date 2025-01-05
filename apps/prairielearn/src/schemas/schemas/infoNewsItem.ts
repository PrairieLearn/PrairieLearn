import { z } from 'zod';

const NewsItemSchema = z
  .object({
    comment: z
      .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
      .describe('Arbitrary comment for reference purposes.')
      .optional(),
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

export { NewsItemSchema };
