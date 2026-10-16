import { createOpenAI } from '@ai-sdk/openai';
import { AIChatAgent, type OnChatMessageOptions } from '@cloudflare/ai-chat';
import {
  type UIMessage,
  type UIMessageChunk,
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from 'ai';

import { type Deferred, createDeferred } from './deferred.js';
import { parseRoute } from './routes.js';
import { type ChatContext, ChatRequestSchema } from './schemas.js';
import { buildInstructions } from './system-prompt.js';

export interface Env {
  Conversation: DurableObjectNamespace<Conversation>;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  PL_SERVICE_TOKEN: string;
}

/** The HTTP request waiting on the current turn's reply stream. */
interface PendingTurn {
  context: ChatContext | undefined;
  stream: Deferred<ReadableStream<UIMessageChunk>>;
}

/**
 * One conversation. The transcript is `AIChatAgent`'s built-in `this.messages`,
 * which the SDK persists itself. Chat is served over plain HTTP (from
 * PrairieLearn) instead of the SDK's WebSocket protocol, so the wire format is
 * the AI SDK UI message stream.
 */
export class Conversation extends AIChatAgent<Env> {
  private pendingTurn: PendingTurn | null = null;

  override async onRequest(request: Request): Promise<Response> {
    const route = parseRoute(new URL(request.url).pathname);
    if (route?.action === 'messages' && request.method === 'GET') {
      return Response.json(this.messages);
    }
    if (route?.action === 'chat' && request.method === 'POST') {
      return this.handleChat(request);
    }
    return new Response('Not found', { status: 404 });
  }

  private async handleChat(request: Request): Promise<Response> {
    const parsed = ChatRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return new Response('Invalid request', { status: 400 });
    const { message, context } = parsed.data;

    if (this.pendingTurn) {
      return new Response('A reply is already in progress', { status: 409 });
    }
    if (this.messages.some((m) => m.id === message.id)) {
      return new Response('Duplicate message', { status: 409 });
    }

    const turn: PendingTurn = { context, stream: createDeferred() };
    this.pendingTurn = turn;

    // Stop: when PrairieLearn stops reading (the user pressed Stop or
    // disconnected), cancel the turn. Cancellation of the response stream is
    // what reliably reaches the Durable Object; the request signal is linked
    // too in case it fires.
    const abort = new AbortController();
    request.signal.addEventListener('abort', () => abort.abort(request.signal.reason));

    // The SDK persists the user message, runs `onChatMessage`, and persists
    // the reply, including a partial reply when the turn is cancelled.
    void this.saveMessages((messages) => [...messages, message as UIMessage], {
      signal: abort.signal,
    })
      .catch((err: unknown) => turn.stream.reject(err))
      .finally(() => {
        turn.stream.reject(new Error('The turn ended without producing a reply'));
        if (this.pendingTurn === turn) this.pendingTurn = null;
      });

    let stream: ReadableStream<UIMessageChunk>;
    try {
      stream = await turn.stream.promise;
    } catch {
      return new Response('The agent could not start a reply', { status: 502 });
    }
    return createUIMessageStreamResponse({ stream: cancelOnDisconnect(stream, abort) });
  }

  override async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const turn = this.pendingTurn;
    const result = streamText({
      model: createOpenAI({ apiKey: this.env.OPENAI_API_KEY })(this.env.OPENAI_MODEL),
      instructions: buildInstructions(turn?.context),
      messages: await convertToModelMessages(this.messages),
      abortSignal: options?.abortSignal,
    });
    const stream = toUIMessageStream({ stream: result.stream });

    // Turns without a waiting HTTP request (e.g. recovery after a restart) are
    // still run and persisted by the SDK.
    if (!turn) return createUIMessageStreamResponse({ stream });

    // One copy goes to the SDK, which persists it; the other streams back to
    // the HTTP caller.
    const [forSdk, forCaller] = stream.tee();
    turn.stream.resolve(forCaller);
    return createUIMessageStreamResponse({ stream: forSdk });
  }
}

/**
 * Passes `stream` through unchanged, aborting `abort` if the reader cancels it.
 */
function cancelOnDisconnect<T>(stream: ReadableStream<T>, abort: AbortController) {
  const reader = stream.getReader();
  return new ReadableStream<T>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel(reason) {
      abort.abort(reason);
      await reader.cancel(reason).catch(() => {});
    },
  });
}
