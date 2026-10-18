import { z } from 'zod';

const ChatContextSchema = z.object({
  courseTitle: z.string().max(500),
  courseShortName: z.string().max(100),
});
export type ChatContext = z.infer<typeof ChatContextSchema>;

/** Only the newest user text message is sent; history lives in the service. */
const ChatPostBodySchema = z.object({
  message: z.object({
    id: z.string().min(1).max(100),
    role: z.literal('user'),
    parts: z.tuple([
      z.object({
        type: z.literal('text'),
        text: z
          .string()
          .max(20_000)
          .refine((text) => text.trim().length > 0),
      }),
    ]),
  }),
  context: ChatContextSchema.optional(),
});
export type ChatRequest = z.infer<typeof ChatPostBodySchema>;

/** Parses a chat request body, returning null if it is invalid. */
export function parseChatRequest(body: unknown): ChatRequest | null {
  const parsed = ChatPostBodySchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}
