import {
  type UIMessage,
  type UIMessageChunk,
  readUIMessageStream,
  uiMessageChunkSchema,
  validateUIMessages,
} from 'ai';
import { EventSourceParserStream } from 'eventsource-parser/stream';
import { z } from 'zod';

const ReplySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('idle') }),
  z.object({ status: z.literal('running'), assistantMessageId: z.uuid() }),
  z.object({
    status: z.literal('failed'),
    error: z.object({ code: z.string(), message: z.string() }),
  }),
]);
export type ClientReplyState = z.infer<typeof ReplySchema>;
const FrameSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('snapshot'),
    phase: z.enum(['initial', 'final']),
    messages: z.array(z.unknown()),
    reply: ReplySchema,
  }),
  z.object({ type: z.literal('chunk'), chunk: z.unknown() }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
interface Snapshot {
  messages: UIMessage[];
  reply: ClientReplyState;
}

export class ChatReadError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** Reads one snapshot/reply response. Only the AI SDK assembles message parts. */
export async function readChat(
  response: Response,
  signal: AbortSignal,
  onSnapshot: (snapshot: Snapshot) => void,
  onMessage: (messages: UIMessage[]) => void,
) {
  if (!response.ok || !response.body) {
    throw new ChatReadError('Could not reconnect to the conversation.', response.status >= 500);
  }
  const records = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new EventSourceParserStream({ onError: 'terminate', maxBufferSize: 32 * 1024 * 1024 }),
    )
    .getReader();
  const nextFrame = async () => {
    signal.throwIfAborted();
    const next = await records.read();
    if (next.done) return null;
    return FrameSchema.parse(JSON.parse(next.value.data));
  };
  const snapshot = async (
    frame: Extract<z.infer<typeof FrameSchema>, { type: 'snapshot' }>,
  ): Promise<Snapshot> => ({
    messages:
      frame.messages.length > 0 ? await validateUIMessages({ messages: frame.messages }) : [],
    reply: frame.reply,
  });
  try {
    const first = await nextFrame();
    if (first?.type !== 'snapshot' || first.phase !== 'initial') {
      throw new ChatReadError('The conversation returned an invalid response.', false);
    }
    const initial = await snapshot(first);
    signal.throwIfAborted();
    onSnapshot(initial);
    const result: { final: Snapshot | null; streamError: Error | null; serverError: Error | null } =
      { final: null, streamError: null, serverError: null };
    const chunks = new ReadableStream<UIMessageChunk>({
      async pull(controller) {
        try {
          for (;;) {
            const frame = await nextFrame();
            if (!frame) {
              controller.close();
              return;
            }
            if (frame.type === 'snapshot') {
              if (frame.phase !== 'final') throw new Error('Unexpected snapshot');
              result.final = await snapshot(frame);
            } else if (frame.type === 'error') {
              result.serverError = new ChatReadError(frame.message, false);
            } else {
              const parsed = await uiMessageChunkSchema().validate!(frame.chunk);
              if (!parsed.success) throw parsed.error;
              controller.enqueue(parsed.value);
              return;
            }
          }
        } catch (err) {
          controller.error(err);
        }
      },
    });
    try {
      for await (const message of readUIMessageStream({
        stream: chunks,
        onError: (err) => {
          result.streamError =
            err instanceof Error ? err : new Error('The reply could not be read.');
        },
      })) {
        signal.throwIfAborted();
        onMessage([...initial.messages.filter((old) => old.id !== message.id), message]);
      }
    } catch (err) {
      // SDK message cutover may end replay mid-part. Saved history wins, if supplied.
      if (!result.final) throw err;
    }
    signal.throwIfAborted();
    if (result.final) {
      onSnapshot(result.final);
    } else if (initial.reply.status === 'running') {
      throw new ChatReadError('The connection closed before the reply was saved.', true);
    }
    if (result.serverError) throw result.serverError;
    if (result.streamError && !result.final) throw result.streamError;
  } finally {
    await records.cancel().catch(() => {});
    records.releaseLock();
  }
}
