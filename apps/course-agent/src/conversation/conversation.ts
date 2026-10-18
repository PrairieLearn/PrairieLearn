import { createOpenAI } from '@ai-sdk/openai';
import { AIChatAgent, type OnChatMessageOptions } from '@cloudflare/ai-chat';
import {
  type GenerateTextOnFinishCallback,
  type ToolSet,
  type UIMessageChunk,
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from 'ai';

import type { Env } from '../env.js';
import { type ChatContext, parseChatRequest } from '../http/chat-request.js';

import { buildInstructions } from './instructions.js';

interface ConversationState {
  courseContext: ChatContext | null;
}

/**
 * One conversation. The transcript is `AIChatAgent`'s built-in `this.messages`,
 * which the SDK persists to its own tables in this Durable Object's storage.
 * Chat is served over plain HTTP (from PrairieLearn) instead of the SDK's
 * WebSocket protocol, so the wire format is the AI SDK UI message stream.
 */
export class Conversation extends AIChatAgent<Env, ConversationState> {
  override initialState: ConversationState = { courseContext: null };
  /** The turn whose HTTP request is waiting for its reply, if any. */
  private turn: {
    replyReady: PromiseWithResolvers<ReadableStream<UIMessageChunk>>;
    abort: AbortController;
  } | null = null;

  // The Worker has already authenticated and routed the request. History is
  // served by `AIChatAgent`'s built-in `get-messages` route (the Worker forwards
  // `GET /messages` there), so only chat is handled here.
  override async onRequest(request: Request): Promise<Response> {
    if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/chat')) {
      return this.handleChat(request);
    }
    return new Response('Not found', { status: 404 });
  }

  private async handleChat(request: Request): Promise<Response> {
    const chatRequest = parseChatRequest(await request.json().catch(() => null));
    if (!chatRequest) return new Response('Invalid request', { status: 400 });
    const { message, context } = chatRequest;

    if (this.turn) {
      return new Response('A reply is already in progress', { status: 409 });
    }

    // Retain the PL-supplied prompt context for SDK recovery without an HTTP request.
    if (context) this.setState({ courseContext: context });

    // onChatMessage supplies the stream before saveMessages finishes consuming it.
    const turn = {
      replyReady: Promise.withResolvers<ReadableStream<UIMessageChunk>>(),
      abort: new AbortController(),
    };
    this.turn = turn;

    // Run persistence in the background so HTTP can stream before the turn finishes.
    // The SDK saves the user message, runs onChatMessage, and saves the reply.
    void (async () => {
      try {
        await this.saveMessages(
          (messages) => [...messages, { ...message, id: crypto.randomUUID() }],
          {
            signal: turn.abort.signal,
          },
        );
        // Normally, onChatMessage has already resolved replyReady with the stream,
        // so this reject call is a no-op. It only rejects if no stream was supplied,
        // preventing the HTTP handler from waiting forever.
        turn.replyReady.reject(new Error('The turn ended without producing a reply'));
      } catch (err) {
        turn.replyReady.reject(err);
      } finally {
        // Keep the turn active until SDK persistence finishes, even if HTTP closes first.
        if (this.turn === turn) this.turn = null;
      }
    })();

    try {
      const reader = (await turn.replyReady.promise).getReader();
      return createUIMessageStreamResponse({
        stream: new ReadableStream<UIMessageChunk>({
          async pull(controller) {
            const { done, value } = await reader.read();
            if (done) controller.close();
            else controller.enqueue(value);
          },
          cancel(reason) {
            // Abort generation but leave the SDK's branch available to save the partial reply.
            // PL disconnects do not reliably reach this callback; explicit Stop is a follow-up.
            turn.abort.abort(reason);
            // A tee branch's cancellation waits for the other branch, so don't await it here.
            reader.cancel(reason).catch(() => {});
          },
        }),
      });
    } catch {
      return new Response('The agent could not start a reply', { status: 502 });
    }
  }

  // Runs for each turn started by `saveMessages()` in `handleChat`, and when the
  // SDK recovers a turn interrupted by a restart (then no request is waiting).
  override async onChatMessage(
    _onFinish: GenerateTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions,
  ) {
    const turn = this.turn;
    const result = streamText({
      model: createOpenAI({ apiKey: this.env.OPENAI_API_KEY })(this.env.OPENAI_MODEL),
      instructions: buildInstructions(this.state.courseContext ?? undefined),
      messages: await convertToModelMessages(this.messages),
      abortSignal: options?.abortSignal,
    });
    const reply = toUIMessageStream({
      stream: result.stream,
      // Put the reply's ID in its `start` chunk before the stream is split, so
      // the copy streamed to the caller and the copy the SDK persists share it.
      originalMessages: this.messages,
      generateMessageId: () => crypto.randomUUID(),
    });
    // When the SDK resumes a turn interrupted by a restart, the original HTTP
    // request is gone. Return the stream directly for the SDK to consume and save.
    if (!turn) return createUIMessageStreamResponse({ stream: reply });

    // Both branches receive the same chunks and reply ID.
    const [forHistory, forHttp] = reply.tee();
    // The waiting HTTP handler sends forHttp through PrairieLearn to the user.
    turn.replyReady.resolve(forHttp);
    // The Cloudflare Agents SDK automatically consumes forHistory and records the reply in history.
    return createUIMessageStreamResponse({ stream: forHistory });
  }
}
