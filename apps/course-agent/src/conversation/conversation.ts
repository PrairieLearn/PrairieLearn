import { AIChatAgent, type OnChatMessageOptions } from '@cloudflare/ai-chat';
import type { Connection, WSMessage } from 'agents';
import { type UIMessageChunk, createUIMessageStreamResponse } from 'ai';
import { z } from 'zod';

import {
  type Command,
  CommandSchema,
  type ConversationEvent,
  type Snapshot,
  type Summary,
} from '@prairielearn/course-agent-protocol';

import { Output, publicMessage } from './output.js';
import { type ModelEnvironment, type ReplyInput, createModelReply } from './runtime.js';
import { type ChatState, ChatStateSchema, INITIAL_STATE, migrateChatState } from './state.js';

const PartStart = z.object({ type: z.enum(['text-start', 'reasoning-start']), id: z.string() });
const PartDelta = z.object({
  type: z.enum(['text-delta', 'reasoning-delta']),
  id: z.string(),
  delta: z.string(),
});
const PartEnd = z.object({ type: z.enum(['text-end', 'reasoning-end']), id: z.string() });
const OutputChunkSchema = z.union([PartStart, PartDelta, PartEnd]);
const SdkFrameSchema = z.object({
  type: z.literal('cf_agent_use_chat_response'),
  body: z.string().optional(),
  error: z.boolean().optional(),
  done: z.boolean().optional(),
});
interface Observation {
  mode: 'full' | 'summary';
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The SDK owns messages and durable output; this class owns admission and the public protocol. */
export class Conversation extends AIChatAgent<ModelEnvironment, ChatState> {
  override initialState = INITIAL_STATE;
  private live: { turnId: string; abort: AbortController; output: Output; failed: boolean } | null =
    null;

  constructor(ctx: DurableObjectState, env: ModelEnvironment) {
    super(ctx, env);
    // AIChatAgent wraps these callbacks with its chat/resume protocol. Replace those
    // wrappers: authenticated PL sockets may use only our validated commands.
    this.onConnect = () => {};
    this.onMessage = (connection, message) => this.handleCommand(connection, message);
  }

  override shouldSendProtocolMessages() {
    return false;
  }

  override shouldConnectionBeReadonly() {
    return true;
  }

  override onStart() {
    this.currentState();
    if (['starting', 'waiting_for_agent', 'stopping'].includes(this.state.status)) {
      this.saveState({
        status: 'blocked',
        error:
          'The previous reply was interrupted. Resume the conversation to send another message.',
      });
    }
  }

  protected override async onChatRecovery() {
    // Let the SDK save buffered partial output, but never restart inference on wake.
    this.saveState({
      status: 'blocked',
      error: 'The previous reply was interrupted. Resume the conversation to send another message.',
    });
    return { continue: false };
  }

  private currentState() {
    const decoded = migrateChatState(this.state);
    if (!decoded.migrated) return decoded.state;
    const state = ChatStateSchema.parse({
      ...decoded.state,
      latestAssistantMessageId:
        this.messages.findLast((message) => message.role === 'assistant')?.id ?? null,
    });
    this.setState(state);
    return state;
  }

  private saveState(patch: Partial<Omit<ChatState, 'schemaVersion' | 'revision'>>) {
    const current = this.currentState();
    this.setState(ChatStateSchema.parse({ ...current, ...patch, revision: current.revision + 1 }));
    this.emit({ type: 'event', event: 'conversation.status_changed', data: this.summary() });
  }

  private summary(): Summary {
    return {
      revision: this.state.revision,
      status: this.state.status,
      activeTurnId: this.state.execution?.turnId ?? null,
      latestAssistantMessageId: this.state.latestAssistantMessageId,
      error: this.state.error,
      capabilities: {
        send: ['offline', 'waiting_for_user'].includes(this.state.status),
        stop: ['starting', 'waiting_for_agent', 'stopping'].includes(this.state.status),
        resume: this.state.status === 'blocked',
      },
    };
  }

  snapshot(before?: string): Promise<Snapshot> {
    return this.ctx.blockConcurrencyWhile(() => this.readSnapshot(before));
  }

  private async readSnapshot(before?: string): Promise<Snapshot> {
    const messages: Snapshot['messages'] = [];
    let hasMore = false;
    for await (const batch of this.sessions.session().historyBatches({
      newestFirst: true,
      leafId: before,
      batchSize: 16,
    })) {
      for (const message of batch) {
        if (message.id === before || !['user', 'assistant'].includes(message.role)) continue;
        messages.push(publicMessage(message));
        if (messages.length === 51) break;
      }
      if (messages.length === 51) {
        hasMore = true;
        messages.pop();
        break;
      }
    }
    messages.reverse();
    const partial = this.live?.output.message;
    if (!before && partial && !messages.some((message) => message.id === partial.id)) {
      messages.push(structuredClone(partial));
    }
    return { summary: this.summary(), messages, hasMore };
  }

  private emit(event: ConversationEvent) {
    const frame = JSON.stringify(event);
    for (const connection of this.getConnections<Observation>()) {
      const mode = connection.state?.mode;
      if (!mode || (mode === 'summary' && event.event !== 'conversation.status_changed')) continue;
      connection.send(frame);
    }
  }

  private async handleCommand(connection: Connection, message: WSMessage) {
    if (typeof message !== 'string' || message.length > 64 * 1024) {
      connection.close(1009, 'Invalid command');
      return;
    }
    const parsed = CommandSchema.safeParse(parseJson(message));
    if (!parsed.success) {
      connection.close(1008, 'Unsupported command');
      return;
    }
    const command = parsed.data;
    try {
      const result = await this.command(connection, command);
      connection.send(JSON.stringify({ type: 'result', ref: command.ref, result }));
    } catch (err) {
      const busy = err instanceof BusyError;
      connection.send(
        JSON.stringify({
          type: 'error',
          ref: command.ref,
          code: busy ? 409 : 502,
          message: busy ? err.message : 'The agent could not complete this command.',
        }),
      );
    }
  }

  private async command(connection: Connection, command: Command) {
    switch (command.method) {
      case 'conversation.subscribe': {
        if (command.params.mode === 'summary') {
          connection.setState({ mode: 'summary' });
          connection.send(
            JSON.stringify({
              type: 'event',
              event: 'conversation.status_changed',
              data: this.summary(),
            }),
          );
        } else {
          // Briefly gate DO events while reading a bounded SDK history page.
          // Register and send before releasing the gate, so no output can slip
          // between snapshot assembly and the following live events.
          await this.ctx.blockConcurrencyWhile(async () => {
            const snapshot = await this.readSnapshot();
            connection.setState({ mode: 'full' });
            connection.send(
              JSON.stringify({ type: 'event', event: 'conversation.snapshot', data: snapshot }),
            );
          });
        }
        return {};
      }
      case 'turn.start': {
        if (!this.summary().capabilities.send) {
          throw new BusyError('The conversation is not ready for another message.');
        }
        const execution = {
          turnId: crypto.randomUUID(),
          messageId: crypto.randomUUID(),
          assistantMessageId: crypto.randomUUID(),
        };
        const live = {
          turnId: execution.turnId,
          abort: new AbortController(),
          output: new Output(execution.turnId, execution.assistantMessageId),
          failed: false,
        };
        this.live = live;
        this.saveState({
          status: 'starting',
          execution,
          courseContext: command.params.context,
          error: null,
        });
        try {
          // Acknowledgement means the user message and execution were saved. It
          // does not mean generation finished, and the command is never replayed.
          await this.persistMessages([
            ...this.messages,
            {
              id: execution.messageId,
              role: 'user',
              parts: [{ type: 'text', text: command.params.text }],
            },
          ]);
        } catch (err) {
          this.live = null;
          this.saveState({ status: 'blocked', error: 'The message could not be saved.' });
          throw err;
        }
        this.ctx.waitUntil(this.runTurn(live));
        return { turnId: execution.turnId, messageId: execution.messageId };
      }
      case 'turn.stop': {
        // A late Stop for an old turn must never cancel its successor.
        if (this.state.execution?.turnId === command.params.turnId && this.live) {
          this.saveState({ status: 'stopping' });
          this.live.abort.abort();
        }
        return {};
      }
      case 'conversation.resume': {
        if (this.state.status !== 'blocked') return {};
        if (this.live || !(await this.waitUntilStable({ timeout: 5000 }))) {
          throw new BusyError('The previous reply has not stopped yet.');
        }
        this.saveState({ status: 'waiting_for_user', execution: null, error: null });
        return {};
      }
    }
  }

  private async runTurn(live: NonNullable<Conversation['live']>) {
    let outcome: 'completed' | 'cancelled' | 'failed' = 'completed';
    try {
      const result = await this.saveMessages((messages) => [...messages], {
        signal: live.abort.signal,
      });
      if (live.abort.signal.aborted) outcome = 'cancelled';
      else if (result.status !== 'completed' || live.failed) outcome = 'failed';
    } catch {
      outcome = live.abort.signal.aborted ? 'cancelled' : 'failed';
    }
    // saveMessages has consumed and persisted the SDK stream before admission
    // reopens. Closing an observer never reaches this AbortController.
    this.live = null;
    const error = outcome === 'failed' ? 'The agent could not finish its reply.' : null;
    this.saveState({
      status: error ? 'blocked' : 'waiting_for_user',
      execution: error ? this.state.execution : null,
      error,
    });
    this.emit({
      type: 'event',
      event: 'turn.finished',
      data: { turnId: live.turnId, outcome, error },
    });
  }

  protected createReply(input: ReplyInput): Promise<ReadableStream<UIMessageChunk>> {
    return createModelReply(this.env, input);
  }

  override async onChatMessage(_onFinish: unknown, _options?: OnChatMessageOptions) {
    if (!this.live || !this.state.execution) {
      throw new Error('An interrupted execution cannot be redispatched');
    }
    if (this.state.status !== 'stopping') this.saveState({ status: 'waiting_for_agent' });
    return createUIMessageStreamResponse({
      stream: await this.createReply({
        messages: this.messages,
        messageId: this.state.execution.assistantMessageId,
        signal: this.live.abort.signal,
        context: this.state.courseContext,
      }),
    });
  }

  override async persistMessages(
    ...args: Parameters<AIChatAgent<ModelEnvironment, ChatState>['persistMessages']>
  ) {
    const prior = new Set(this.messages.map((message) => message.id));
    await super.persistMessages(...args);
    for (const message of this.messages) {
      if (prior.has(message.id) || message.role === 'system') continue;
      if (message.role === 'assistant') this.saveState({ latestAssistantMessageId: message.id });
      this.emit({ type: 'event', event: 'message.completed', data: publicMessage(message) });
    }
  }

  override broadcast(...args: Parameters<AIChatAgent<ModelEnvironment, ChatState>['broadcast']>) {
    // Never forward SDK history, state, RPC, or resume frames. Only adapt known
    // output chunks into public events. The SDK still owns durable chunk storage.
    if (typeof args[0] !== 'string' || !this.live) return;
    const frame = SdkFrameSchema.safeParse(parseJson(args[0]));
    if (!frame.success) return;
    if (frame.data.error) this.live.failed = true;
    if (frame.data.done || !frame.data.body) return;
    // The pinned SDK batches ten chunks in memory. Flush its own log before
    // publishing output, so a restart can recover even a short partial reply.
    // Keep this SDK compatibility seam covered by the real restart test.
    this._resumableStream.flushBuffer();
    const chunk = OutputChunkSchema.safeParse(parseJson(frame.data.body));
    if (!chunk.success) return;
    const event = this.live.output.accept(chunk.data);
    if (event) this.emit(event);
  }
}

class BusyError extends Error {}
