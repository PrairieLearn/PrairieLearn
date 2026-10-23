import { createOpenAI } from '@ai-sdk/openai';
import { AIChatAgent, type OnChatMessageOptions } from '@cloudflare/ai-chat';
import {
  type UIMessage,
  type UIMessageChunk,
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  uiMessageChunkSchema,
  validateUIMessages,
} from 'ai';
import { z } from 'zod';

import { type ChatContext, parseChatRequest } from '../http/chat-request.js';

import { buildInstructions } from './instructions.js';
import { Reply } from './reply.js';

interface ConversationState {
  model?: string;
  courseContext: ChatContext | null;
}
const StopBodySchema = z.object({ assistantMessageId: z.uuid() });
const StoredSegmentSchema = z.union([z.string(), z.array(z.string())]);
const errorState = () => ({
  status: 'failed' as const,
  error: { code: 'reply_failed', message: 'The agent could not finish its reply.' },
});

/** One execution owner, with independent HTTP readers. The SDK owns all history. */
export class Conversation extends AIChatAgent<Env, ConversationState> {
  override initialState: ConversationState = { courseContext: null };
  private reply = new Reply();

  override async onStart() {
    this.getModel();
    const orphan = this._activeStreamId;
    if (orphan) {
      // HTTP can arrive before the SDK's queued recovery task. Settle its own
      // orphan log first, so the first GET cannot incorrectly report idle history.
      await this._persistOrphanedStream(orphan);
      this._completeStream(orphan, 'aborted');
      await this.onChatRecovery();
    }
  }

  private getModel(): string {
    if (this.state.model) return this.state.model;
    const model = this.env.OPENAI_MODEL;
    this.setState({ ...this.state, model });
    return model;
  }

  protected override async onChatRecovery() {
    if (this.reply.state.status !== 'running') {
      this.reply.update({
        status: 'failed',
        error: {
          code: 'reply_interrupted',
          message: 'The previous reply was interrupted. You can send another message.',
        },
      });
    }
    // Recover saved partial output, but never redispatch the interrupted prompt.
    return { continue: false };
  }

  override async onRequest(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.endsWith('/stop') && request.method === 'POST') {
      const parsed = StopBodySchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return new Response('Invalid request', { status: 400 });
      if (
        this.reply.state.status !== 'running' ||
        this.reply.state.assistantMessageId !== parsed.data.assistantMessageId
      ) {
        return new Response(null, { status: 204 });
      }
      this.reply.abort.abort();
      return new Response(null, { status: 202 });
    }
    if (!path.endsWith('/chat')) return new Response('Not found', { status: 404 });
    if (this.reply.state.status !== 'running' && !(await this.waitUntilStable({ timeout: 5000 }))) {
      return new Response('The previous reply is still settling', { status: 503 });
    }
    if (request.method === 'GET') return this.readChat(request);
    if (request.method === 'POST') return this.startChat(request);
    return new Response('Not found', { status: 404 });
  }

  private async history(): Promise<UIMessage[]> {
    const messages = await this.sessions.session().getHistory();
    const visible = messages.filter((message) => message.role !== 'system');
    return visible.length > 0 ? await validateUIMessages({ messages: visible }) : [];
  }

  private publicState(reply: Reply) {
    const state = reply.state;
    if (state.status !== 'running') return state;
    return { status: 'running' as const, assistantMessageId: state.assistantMessageId };
  }

  private async startChat(request: Request): Promise<Response> {
    const parsed = parseChatRequest(await request.json().catch(() => null));
    if (!parsed) return new Response('Invalid request', { status: 400 });
    const accepted = await this.ctx.blockConcurrencyWhile(async () => {
      if (this.reply.state.status === 'running') return null;
      const reply = new Reply();
      const assistantMessageId = crypto.randomUUID();
      reply.update({ status: 'running', assistantMessageId, streamId: null });
      this.reply = reply;
      if (parsed.context) this.setState({ ...this.state, courseContext: parsed.context });
      try {
        await this.persistMessages([
          ...this.messages,
          { ...parsed.message, id: crypto.randomUUID() },
        ]);
      } catch (err) {
        reply.update(errorState());
        throw err;
      }
      this.ctx.waitUntil(this.runReply(reply));
      return { reply, assistantMessageId };
    });
    if (!accepted) return new Response('A reply is already in progress', { status: 409 });
    // Return headers before output exists, so Stop can target even a silent reply.
    const stream = this.postOutput(accepted.reply, request.signal);
    return createUIMessageStreamResponse({
      stream,
      headers: { 'X-Assistant-Message-Id': accepted.assistantMessageId },
    });
  }

  private async runReply(reply: Reply) {
    let failed = false;
    try {
      const result = await this.saveMessages((messages) => [...messages], {
        signal: reply.abort.signal,
      });
      failed = !reply.abort.signal.aborted && result.status !== 'completed';
    } catch {
      failed = !reply.abort.signal.aborted;
    } finally {
      reply.update(failed ? errorState() : { status: 'idle' });
    }
  }

  private postOutput(reply: Reply, signal: AbortSignal): ReadableStream<UIMessageChunk> {
    let reader: ReadableStreamDefaultReader<UIMessageChunk> | null = null;
    return new ReadableStream({
      pull: async (controller) => {
        try {
          while (!reply.httpStream && reply.state.status === 'running') {
            await reply.wait(reply.state, signal);
          }
          if (!reader && reply.httpStream) reader = reply.httpStream.getReader();
          const next = await reader?.read();
          if (next && !next.done) {
            controller.enqueue(next.value);
            return;
          }
          while (reply.state.status === 'running') await reply.wait(reply.state, signal);
          if (reply.state.status === 'failed') {
            controller.enqueue({ type: 'error', errorText: reply.state.error.message });
          }
          controller.close();
        } catch (err) {
          if (signal.aborted) {
            reply.httpDetached = true;
            void reader?.cancel().catch(() => {});
          }
          controller.error(err);
        }
      },
      cancel: () => {
        reply.httpDetached = true;
        // Never abort the producer. A tee cancellation need not await SDK persistence.
        void reader?.cancel().catch(() => {});
        if (!reader) void reply.httpStream?.cancel().catch(() => {});
      },
    });
  }

  private async readChat(request: Request): Promise<Response> {
    const captured = await this.ctx.blockConcurrencyWhile(async () => {
      const reply = this.reply;
      const messages = await this.history();
      const assistantId = reply.state.status === 'running' ? reply.state.assistantMessageId : null;
      return {
        reply,
        messages: messages.filter((message) => message.id !== assistantId),
        assistantId,
        initialReply: this.publicState(reply),
      };
    });
    const abort = new AbortController();
    const signal = AbortSignal.any([abort.signal, request.signal]);
    const frames = this.chatFrames(captured, signal);
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const next = await frames.next();
            if (next.done) controller.close();
            else controller.enqueue(encoder.encode(`data: ${JSON.stringify(next.value)}\n\n`));
          } catch (err) {
            if (signal.aborted) {
              controller.error(err);
            } else {
              console.error('Course agent replay failed', err);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'error', message: 'Could not read the reply. Please reconnect.' })}\n\n`,
                ),
              );
              controller.close();
            }
          }
        },
        cancel() {
          abort.abort();
          void frames.return(undefined);
        },
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store, no-transform',
          'X-Accel-Buffering': 'no',
        },
      },
    );
  }

  private async *chatFrames(
    captured: {
      reply: Reply;
      messages: UIMessage[];
      assistantId: string | null;
      initialReply: ReturnType<Conversation['publicState']>;
    },
    signal: AbortSignal,
  ): AsyncGenerator<unknown> {
    const { reply, messages, assistantId } = captured;
    yield { type: 'snapshot', phase: 'initial', messages, reply: captured.initialReply };
    if (!assistantId) return;
    while (reply.state.status === 'running' && reply.state.streamId === null) {
      await reply.wait(reply.state, signal);
    }
    if (reply.state.status === 'running' && reply.state.streamId) {
      const id = reply.state.streamId;
      try {
        for await (const segment of this.streams.read(id, { signal })) {
          const bodies = StoredSegmentSchema.parse(segment.chunk);
          for (const body of typeof bodies === 'string' ? [bodies] : bodies) {
            const parsed = await uiMessageChunkSchema().validate!(JSON.parse(body));
            if (!parsed.success) throw parsed.error;
            yield { type: 'chunk', chunk: parsed.value };
          }
        }
      } catch (err) {
        signal.throwIfAborted();
        // Message cutover deletes SDK stream rows. Other failures must surface.
        if (await this.streams.status(id)) throw err;
      }
    }
    while (reply.state.status === 'running') await reply.wait(reply.state, signal);
    const history = await this.history();
    // Bound the final view to the captured turn, even if another send won the race.
    const end = history.findIndex((message) => message.id === assistantId);
    const lastUser = messages.at(-1)?.id;
    const userEnd = history.findIndex((message) => message.id === lastUser);
    const final = history.slice(0, (end !== -1 ? end : userEnd) + 1);
    yield { type: 'snapshot', phase: 'final', messages: final, reply: this.publicState(reply) };
  }

  // The pinned SDK packs chunks and reclaims them at message cutover. These two
  // hooks expose its own log to HTTP readers, without a second log or broadcasts.
  protected override _startStream(
    ...args: Parameters<AIChatAgent<Env, ConversationState>['_startStream']>
  ) {
    const id = super._startStream(...args);
    if (this.reply.state.status === 'running') {
      this.reply.update({ ...this.reply.state, streamId: id });
    }
    return id;
  }

  protected override async _storeStreamChunk(
    ...args: Parameters<AIChatAgent<Env, ConversationState>['_storeStreamChunk']>
  ) {
    const seq = await super._storeStreamChunk(...args);
    this._flushChunkBuffer();
    return seq;
  }

  protected async createReply(
    signal: AbortSignal,
    messageId: string,
  ): Promise<ReadableStream<UIMessageChunk>> {
    const result = streamText({
      model: createOpenAI({ apiKey: this.env.OPENAI_API_KEY })(this.getModel()),
      instructions: buildInstructions(this.state.courseContext ?? undefined),
      messages: await convertToModelMessages(this.messages),
      abortSignal: signal,
    });
    return toUIMessageStream({
      stream: result.stream,
      originalMessages: this.messages,
      generateMessageId: () => messageId,
    });
  }

  override async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const reply = this.reply;
    if (reply.state.status !== 'running') {
      throw new Error('An interrupted reply cannot be redispatched');
    }
    const stream = await this.createReply(
      options?.abortSignal ?? reply.abort.signal,
      reply.state.assistantMessageId,
    );
    const [history, http] = stream.tee();
    if (reply.httpDetached) void http.cancel().catch(() => {});
    else reply.httpStream = http;
    reply.update({ ...reply.state });
    return createUIMessageStreamResponse({ stream: history });
  }
}
