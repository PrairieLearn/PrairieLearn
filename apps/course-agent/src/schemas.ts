import { z } from 'zod';

const ChatContextSchema = z.object({
  courseTitle: z.string().max(500),
  courseShortName: z.string().max(100),
});
export type ChatContext = z.infer<typeof ChatContextSchema>;

/**
 * Body of `POST /conversations/<uuid>/chat`. PrairieLearn sends only the newest
 * user message; the conversation history lives in this service.
 */
export const ChatRequestSchema = z.object({
  message: z.object({
    id: z.string().min(1).max(100),
    role: z.literal('user'),
    parts: z
      .array(z.object({ type: z.literal('text'), text: z.string().min(1).max(20_000) }))
      .length(1),
  }),
  context: ChatContextSchema.optional(),
});
