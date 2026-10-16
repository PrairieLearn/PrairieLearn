import { type UIMessage, safeValidateUIMessages } from 'ai';
import { z } from 'zod';

const MAX_MESSAGE_ID_LENGTH = 100;
const MAX_TEXT_LENGTH = 20_000;

const ChatContextSchema = z.object({
  courseTitle: z.string().max(500),
  courseShortName: z.string().max(100),
});
export type ChatContext = z.infer<typeof ChatContextSchema>;

/**
 * Body of `POST /conversations/<uuid>/chat`. PrairieLearn sends only the newest
 * user message; the history lives in this service.
 */
const ChatRequestSchema = z.object({
  // A `UIMessage`, checked below with the AI SDK's own validator so it stays in
  // sync with the SDK's message format.
  message: z.unknown(),
  // Course details for the system instructions. Sent with every message:
  // instructions are rebuilt each turn and aren't stored in the history.
  context: ChatContextSchema.optional(),
});

export interface ChatRequest {
  message: UIMessage;
  context: ChatContext | undefined;
}

/** Parses a chat request body, returning `null` if it's invalid. */
export async function parseChatRequest(body: unknown): Promise<ChatRequest | null> {
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) return null;

  const validated = await safeValidateUIMessages({ messages: [parsed.data.message] });
  if (!validated.success) return null;
  const [message] = validated.data;

  // For now, only a single text part from the user, which is what `useChat`'s
  // `sendMessage({ text })` produces. Loosen this when attachments are supported.
  if (message.role !== 'user' || message.id.length > MAX_MESSAGE_ID_LENGTH) return null;
  if (message.parts.length !== 1) return null;
  const [part] = message.parts;
  if (part.type !== 'text' || !part.text.trim() || part.text.length > MAX_TEXT_LENGTH) return null;

  return { message, context: parsed.data.context };
}
