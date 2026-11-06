import type { UIMessageChunk } from 'ai';
import { type MessageConnection, ParameterStructures } from 'vscode-jsonrpc/browser';
import { z } from 'zod';

import type { ToolCall } from '@prairielearn/course-agent-types';

import type { InitializeParams } from '../../generated/types/InitializeParams.js';
import type { DynamicToolCallParams } from '../../generated/types/v2/DynamicToolCallParams.js';
import type { DynamicToolCallResponse } from '../../generated/types/v2/DynamicToolCallResponse.js';
import type { DynamicToolSpec } from '../../generated/types/v2/DynamicToolSpec.js';
import type { ThreadItemsListParams } from '../../generated/types/v2/ThreadItemsListParams.js';
import type { ThreadResumeParams } from '../../generated/types/v2/ThreadResumeParams.js';
import type { ThreadStartParams } from '../../generated/types/v2/ThreadStartParams.js';
import type { TurnInterruptParams } from '../../generated/types/v2/TurnInterruptParams.js';
import type { TurnStartParams } from '../../generated/types/v2/TurnStartParams.js';

import { createCodexConnection } from './codex-connection.js';
import type { CourseSandbox } from './sandbox.js';
import { COURSE_DIR, MESSAGE_TOOL_CHARS, toolCallFromItem } from './tool-calls.js';

// Validate only fields consumed by this adapter; Codex may return additional data.
const EmptyResult = z.object({});
const ThreadResult = z.object({ thread: z.object({ id: z.string() }) });
const TurnResult = z.object({ turn: z.object({ id: z.string() }) });
const TextDelta = z.object({
  threadId: z.string(),
  turnId: z.string(),
  itemId: z.string(),
  delta: z.string(),
});
const TurnCompleted = z.object({
  threadId: z.string(),
  turn: z.object({
    id: z.string(),
    status: z.enum(['inProgress', 'completed', 'interrupted', 'failed']),
    error: z.object({ message: z.string() }).nullable(),
  }),
});

const ItemEvent = z.object({
  threadId: z.string(),
  turnId: z.string(),
  item: z.looseObject({ id: z.string(), type: z.string() }),
});
/** `request_changes` shows as a review card; only a failed call needs its own entry. */
const ReviewToolItem = z.object({
  type: z.literal('dynamicToolCall'),
  tool: z.literal('request_changes'),
  success: z.boolean().nullable(),
});
const RequestChangesCall: z.ZodType<DynamicToolCallParams> = z.object({
  threadId: z.string(),
  turnId: z.string(),
  callId: z.string(),
  namespace: z.null(),
  tool: z.literal('request_changes'),
  arguments: z.strictObject({}),
});
const ItemsPage = z.object({
  data: z.array(z.object({ item: z.object({ type: z.string(), clientId: z.string().nullish() }) })),
  nextCursor: z.string().nullable(),
});

/**
 * Input for one turn. Codex saves the tag on the turn's user message. A `once` input is never
 * submitted twice: an earlier attempt whose acknowledgment was lost already delivered it.
 */
export interface TurnInput {
  text: string;
  tag: string;
  once?: boolean;
  /** Text to prepend given the thread's latest tag (undefined for a thread started this turn). */
  catchUp?: (latestTag: string | null | undefined) => string | null;
}

/** The model receives the reply as the tool result; it does not wait for an instructor. */
export interface ToolReply {
  success: boolean;
  text: string;
}

/** A sandbox's app-server connection, reused across turns until Stop or sandbox cleanup. */
export class CodexAppServerClient {
  private rpc: MessageConnection | null = null;
  private controller: ReadableStreamDefaultController<UIMessageChunk> | null = null;
  private terminal = Promise.withResolvers<undefined>();
  private turnId: string | null = null;
  private threadId: string | null = null;
  /** Codex cannot list a new thread's history until its first user message. */
  private newThread = false;
  private parts = new Map<string, 'text' | 'reasoning'>();
  /** Calls Codex has started but not finished, by history part ID. */
  private runningTools = new Map<string, ToolCall>();
  /** Tool call characters in the open message, which continuation turns append to. */
  private toolChars = { messageId: '', used: 0 };
  private failure: Error | null = null;
  private onReview?: (call: DynamicToolCallParams) => Promise<ToolReply>;

  constructor(private sandbox: DurableObjectStub<CourseSandbox>) {}

  beginTurn(messageId: string, onReview?: (call: DynamicToolCallParams) => Promise<ToolReply>) {
    if (this.controller) throw new Error('An SDK response is already open');
    this.terminal = Promise.withResolvers<undefined>();
    this.turnId = null;
    this.parts.clear();
    this.runningTools.clear();
    if (this.toolChars.messageId !== messageId) this.toolChars = { messageId, used: 0 };
    this.onReview = onReview;
    void this.terminal.promise.catch(() => {});
    return new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        this.controller = controller;
        controller.enqueue({ type: 'start', messageId });
      },
      cancel: () => {
        this.controller = null;
      },
    });
  }

  async connect() {
    if (this.failure) throw this.failure;
    if (this.rpc) return;
    const response = await this.sandbox.fetch('http://codex.internal/', {
      headers: { Upgrade: 'websocket' },
    });
    if (response.status !== 101 || !response.webSocket) {
      throw new Error('Native runner supplied no WebSocket');
    }
    const socket = response.webSocket;
    const rpc = createCodexConnection(socket, (error) => this.fail(error));
    this.rpc = rpc;
    const onNotification = <P>(
      method: string,
      schema: z.ZodType<P>,
      handler: (params: P) => void,
    ) =>
      rpc.onNotification(method, (value: unknown) => {
        try {
          const parsed = schema.safeParse(value);
          if (!parsed.success) throw new Error(`Invalid notification: ${method}`);
          handler(parsed.data);
        } catch (error) {
          this.fail(error instanceof Error ? error : new Error(String(error)));
        }
      });
    rpc.onRequest('item/tool/call', async (value: unknown) => {
      const call = this.parseReviewCall(value);
      if (!this.onReview) throw new Error('Review handling is not configured');
      const reply = await this.onReview(call);
      return {
        success: reply.success,
        contentItems: [{ type: 'inputText', text: reply.text }],
      } satisfies DynamicToolCallResponse;
    });
    rpc.listen();
    onNotification('item/agentMessage/delta', TextDelta, (params) => this.delta('text', params));
    onNotification('item/reasoning/summaryTextDelta', TextDelta, (params) =>
      this.delta('reasoning', params),
    );
    onNotification('item/started', ItemEvent, (params) => this.toolCall('started', params));
    onNotification('item/completed', ItemEvent, (params) => {
      this.toolCall('completed', params);
      const { threadId, item } = params;
      if (threadId !== this.threadId) return;
      const type =
        item.type === 'agentMessage' ? 'text' : item.type === 'reasoning' ? 'reasoning' : null;
      if (!type) return;
      const id = `${type}:${item.id}`;
      if (this.parts.delete(id)) {
        this.emit({ type: type === 'text' ? 'text-end' : 'reasoning-end', id });
      }
    });
    onNotification('turn/completed', TurnCompleted, (params) => {
      if (params.threadId !== this.threadId || (this.turnId && params.turn.id !== this.turnId)) {
        return;
      }
      if (params.turn.status === 'failed') {
        this.terminal.reject(new Error(params.turn.error?.message ?? 'Native turn failed'));
      } else if (params.turn.status === 'completed' || params.turn.status === 'interrupted') {
        this.terminal.resolve(undefined);
      }
    });
    socket.accept();
    await this.request(
      'initialize',
      {
        clientInfo: { name: 'prairielearn', title: 'PrairieLearn', version: '1' },
        capabilities: { experimentalApi: true, requestAttestation: false },
      } satisfies InitializeParams,
      EmptyResult,
    );
    await rpc.sendNotification('initialized');
  }

  private get connection() {
    if (!this.rpc) throw new Error('Native runner is not connected');
    return this.rpc;
  }

  private parseReviewCall(value: unknown): DynamicToolCallParams {
    const parsed = RequestChangesCall.safeParse(value);
    if (!parsed.success || parsed.data.threadId !== this.threadId) {
      throw new Error('Invalid request_changes call');
    }
    return parsed.data;
  }

  private fail(error: Error) {
    this.failure = error;
    this.terminal.reject(error);
    this.rpc?.dispose();
    this.rpc = null;
  }

  private async request<R>(method: string, params: unknown, schema: z.ZodType<R>): Promise<R> {
    const connection = this.connection;
    // A timeout means acceptance is unknown. Dispose pending work without replaying the command.
    const timeout = setTimeout(
      () => this.fail(new Error(`Native command did not settle: ${method}`)),
      30_000,
    );
    try {
      const result = await connection.sendRequest<unknown>(
        method,
        ParameterStructures.byName,
        params,
      );
      const parsed = schema.safeParse(result);
      if (!parsed.success) {
        const error = new Error(`Invalid result for ${method}`);
        this.fail(error);
        throw error;
      }
      return parsed.data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async thread(config: { model: string; instructions: string; threadId: string | null }) {
    const settings = {
      model: config.model,
      cwd: COURSE_DIR,
      approvalPolicy: 'never' as const,
      sandbox: 'danger-full-access' as const,
      developerInstructions: config.instructions,
    } satisfies ThreadStartParams;
    const result = config.threadId
      ? await this.request(
          'thread/resume',
          {
            ...settings,
            threadId: config.threadId,
            excludeTurns: true,
          } satisfies ThreadResumeParams,
          ThreadResult,
        )
      : await this.request(
          'thread/start',
          {
            ...settings,
            dynamicTools: this.onReview ? [requestChangesTool] : [],
          } satisfies ThreadStartParams,
          ThreadResult,
        );
    this.threadId = result.thread.id;
    this.newThread = !config.threadId;
    return result.thread.id;
  }

  /** Submit one turn, with any catch-up text in the same input so both are accepted together. */
  async run(input: TurnInput, accepted: (turnId: string | null) => void) {
    // A thread started for this turn has no history, and Codex cannot list it yet.
    const latestTag =
      this.newThread || (!input.once && !input.catchUp) ? undefined : await this.latestClientId();
    if (input.once && !this.newThread && latestTag === input.tag) {
      accepted(null);
      this.terminal.resolve(undefined);
      return;
    }
    const context = input.catchUp?.(latestTag) ?? null;
    const result = await this.request(
      'turn/start',
      {
        threadId: this.threadId!,
        clientUserMessageId: input.tag,
        input: [
          ...(context ? [{ type: 'text' as const, text: context, text_elements: [] }] : []),
          { type: 'text', text: input.text, text_elements: [] },
        ],
      } satisfies TurnStartParams,
      TurnResult,
    );
    this.turnId = result.turn.id;
    accepted(this.turnId);
  }

  /** The client ID of the thread's most recent user message, read newest first. */
  private async latestClientId() {
    let cursor: string | null = null;
    do {
      const page: z.infer<typeof ItemsPage> = await this.request(
        'thread/items/list',
        {
          threadId: this.threadId!,
          sortDirection: 'desc',
          limit: 50,
          cursor,
        } satisfies ThreadItemsListParams,
        ItemsPage,
      );
      const message = page.data.find((entry) => entry.item.type === 'userMessage');
      if (message) return message.item.clientId ?? null;
      cursor = page.nextCursor;
    } while (cursor);
    return null;
  }

  async interrupt() {
    if (!this.turnId) throw new Error('Native turn acceptance is unknown');
    await this.request(
      'turn/interrupt',
      {
        threadId: this.threadId!,
        turnId: this.turnId,
      } satisfies TurnInterruptParams,
      EmptyResult,
    );
    const timeout = AbortSignal.timeout(30_000);
    const expired = Promise.withResolvers<never>();
    const fail = () => expired.reject(new Error('Native interruption did not settle'));
    timeout.addEventListener('abort', fail, { once: true });
    try {
      await Promise.race([this.terminal.promise, expired.promise]);
    } finally {
      timeout.removeEventListener('abort', fail);
    }
  }

  get finished() {
    return this.terminal.promise;
  }

  private delta(type: 'text' | 'reasoning', params: z.infer<typeof TextDelta>) {
    if (
      params.threadId !== this.threadId ||
      (this.turnId && params.turnId !== this.turnId) ||
      !this.controller
    ) {
      return;
    }
    const id = `${type}:${params.itemId}`;
    if (!this.parts.has(id)) {
      this.parts.set(id, type);
      this.controller.enqueue({ type: type === 'text' ? 'text-start' : 'reasoning-start', id });
    }
    this.controller.enqueue({
      type: type === 'text' ? 'text-delta' : 'reasoning-delta',
      id,
      delta: params.delta,
    });
  }

  /** A tool call's history part, replaced in place when the call completes. */
  private toolCall(phase: 'started' | 'completed', params: z.infer<typeof ItemEvent>) {
    if (params.threadId !== this.threadId || (this.turnId && params.turnId !== this.turnId)) {
      return;
    }
    const review = ReviewToolItem.safeParse(params.item);
    if (review.success && (phase === 'started' || review.data.success !== false)) return;
    const call = toolCallFromItem(phase, params.item);
    if (!call) return;
    const id = `tool:${params.item.id}`;
    if (phase === 'started') {
      this.runningTools.set(id, call);
      this.emit({ type: 'data-tool', id, data: call });
    } else {
      this.runningTools.delete(id);
      const overBudget = this.toolChars.used + JSON.stringify(call).length > MESSAGE_TOOL_CHARS;
      this.emitFinal(id, overBudget ? toolCallFromItem(phase, params.item, false)! : call);
    }
  }

  /** History keeps a call's final form, so the message's budget counts only these. */
  private emitFinal(id: string, call: ToolCall) {
    this.toolChars.used += JSON.stringify(call).length;
    this.emit({ type: 'data-tool', id, data: call });
  }

  /** Whether chunks still reach the turn's SDK response. */
  get streaming() {
    return this.controller !== null;
  }

  emit(chunk: UIMessageChunk) {
    this.controller?.enqueue(chunk);
  }

  closeStream(error?: unknown) {
    if (error) this.terminal.reject(error);
    if (!this.controller) return;
    for (const [id, type] of this.parts) {
      this.controller.enqueue({ type: type === 'text' ? 'text-end' : 'reasoning-end', id });
    }
    // A call still running here never reports an outcome to this message.
    for (const [id, call] of this.runningTools) {
      this.emitFinal(id, { ...call, status: 'interrupted' });
    }
    this.runningTools.clear();
    if (error) {
      this.controller.enqueue({
        type: 'error',
        errorText: 'The course agent stopped unexpectedly. Resume the conversation to continue.',
      });
    }
    this.controller.enqueue({ type: 'finish' });
    this.controller.close();
    this.controller = null;
    this.parts.clear();
  }

  close() {
    // Forced cleanup must release a turn still waiting for a terminal notification.
    this.terminal.reject(new Error('Native runner was stopped'));
    this.rpc?.dispose();
    this.rpc = null;
  }
}

const requestChangesTool: DynamicToolSpec = {
  type: 'function',
  name: 'request_changes',
  description:
    'Submit the current course edits for instructor review. If approved, PrairieLearn saves them (pushing to Git when configured) and syncs the course. The decision arrives in a later message; do not push yourself.',
  inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
};
