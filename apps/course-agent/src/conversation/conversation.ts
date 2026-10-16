import { createOpenAI } from '@ai-sdk/openai';
import { AIChatAgent, type OnChatMessageOptions } from '@cloudflare/ai-chat';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from 'ai';

import type { Env } from '../env.js';
import { parseChatRequest } from '../http/chat-request.js';

import { buildInstructions } from './instructions.js';
import { TurnStream } from './turn-stream.js';

/**
 * One conversation. The transcript is `AIChatAgent`'s built-in `this.messages`,
 * which the SDK persists to its own tables in this Durable Object's storage.
 * Chat is served over plain HTTP (from PrairieLearn) instead of the SDK's
 * WebSocket protocol, so the wire format is the AI SDK UI message stream.
 */
export class Conversation extends AIChatAgent<Env> {
  /** The turn whose HTTP request is waiting for its reply, if any. */
  private turn: TurnStream | null = null;

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
    const chatRequest = await parseChatRequest(await request.json().catch(() => null));
    if (!chatRequest) return new Response('Invalid request', { status: 400 });
    const { message, context } = chatRequest;

    if (this.turn) {
      return new Response('A reply is already in progress', { status: 409 });
    }
    if (this.messages.some((m) => m.id === message.id)) {
      return new Response('Duplicate message', { status: 409 });
    }

    const turn = new TurnStream(context);
    this.turn = turn;

    // The SDK persists the user message to its tables, runs `onChatMessage`,
    // and persists the reply, including a partial reply if the turn is aborted.
    void this.saveMessages((messages) => [...messages, message], { signal: turn.abort.signal })
      .then(
        () => turn.end(),
        (err: unknown) => turn.end(err),
      )
      .finally(() => {
        if (this.turn === turn) this.turn = null;
      });

    try {
      return createUIMessageStreamResponse({ stream: await turn.callerStream() });
    } catch {
      return new Response('The agent could not start a reply', { status: 502 });
    }
  }

  // Runs for each turn started by `saveMessages()` in `handleChat`, and when the
  // SDK recovers a turn interrupted by a restart (then no request is waiting).
  override async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const turn = this.turn;
    const result = streamText({
      model: createOpenAI({ apiKey: this.env.OPENAI_API_KEY })(this.env.OPENAI_MODEL),
      instructions: buildInstructions(turn?.context),
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
    return createUIMessageStreamResponse({ stream: turn ? turn.split(reply) : reply });
  }
}
