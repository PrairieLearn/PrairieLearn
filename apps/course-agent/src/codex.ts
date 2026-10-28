import type { UIMessageChunk } from 'ai';
import { type MessageConnection, ParameterStructures } from 'vscode-jsonrpc/browser';
import { z } from 'zod';

import { type PushSyncResult, type ReviewOutcome } from '@prairielearn/course-agent-types';

import type { InitializeParams } from '../generated/types/InitializeParams.js';
import type { DynamicToolCallParams } from '../generated/types/v2/DynamicToolCallParams.js';
import type { DynamicToolCallResponse } from '../generated/types/v2/DynamicToolCallResponse.js';
import type { DynamicToolSpec } from '../generated/types/v2/DynamicToolSpec.js';
import type { ThreadReadParams } from '../generated/types/v2/ThreadReadParams.js';
import type { ThreadResumeParams } from '../generated/types/v2/ThreadResumeParams.js';
import type { ThreadStartParams } from '../generated/types/v2/ThreadStartParams.js';
import type { TurnInterruptParams } from '../generated/types/v2/TurnInterruptParams.js';
import type { TurnStartParams } from '../generated/types/v2/TurnStartParams.js';

import { createCodexConnection } from './codex-connection.js';
import type { CourseSandbox } from './sandbox.js';

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

const ItemCompleted = z.object({
  threadId: z.string(),
  item: z.object({ id: z.string(), type: z.string() }),
});
const PushSyncCall: z.ZodType<DynamicToolCallParams> = z.object({
  threadId: z.string(),
  turnId: z.string(),
  callId: z.string(),
  namespace: z.null(),
  tool: z.literal('push_sync'),
  arguments: z.strictObject({}),
});
const FunctionCallOutput = z.object({
  type: z.literal('functionCallOutput'),
  name: z.string(),
  output: z.string(),
});
const ThreadHistory = z.object({
  thread: z.object({
    turns: z.array(
      z.object({
        items: z.array(
          z.union([
            FunctionCallOutput,
            z.object({ type: z.string() }).refine((item) => item.type !== 'functionCallOutput'),
          ]),
        ),
      }),
    ),
  }),
});

/** One app-server connection and its conversion into the chat SDK's output format. */
export class CodexAppServerClient {
  private rpc: MessageConnection | null = null;
  private controller: ReadableStreamDefaultController<UIMessageChunk> | null = null;
  private terminal = Promise.withResolvers<undefined>();
  private turnId: string | null = null;
  private threadId: string | null = null;
  private parts = new Map<string, 'text' | 'reasoning'>();
  stream: ReadableStream<UIMessageChunk>;

  constructor(
    private sandbox: DurableObjectStub<CourseSandbox>,
    readonly messageId: string,
    private onReview?: (call: DynamicToolCallParams, ready: () => void) => Promise<PushSyncResult>,
  ) {
    // Setup can fail before the execution helper starts waiting for completion.
    void this.terminal.promise.catch(() => {});
    this.stream = this.openStream();
  }

  /** A review ends one SDK response while retaining the live native connection. */
  openStream() {
    if (this.controller) throw new Error('An SDK response is already open');
    this.stream = new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        this.controller = controller;
        controller.enqueue({ type: 'start', messageId: this.messageId });
      },
      cancel: () => {
        this.controller = null;
      },
    });
    return this.stream;
  }

  async connect() {
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
      const result = await this.onReview(call, () => {
        // The frontend uses this tool part to load the saved review from PL.
        // File contents stay in DO storage instead of entering chat history.
        this.emit({
          type: 'tool-input-available',
          toolCallId: call.callId,
          toolName: 'push_sync',
          input: {},
        });
        this.finishResponse();
      });
      const response = {
        success: result.publication.status === 'published' && result.sync.status === 'succeeded',
        contentItems: [{ type: 'inputText' as const, text: JSON.stringify(result) }],
      } satisfies DynamicToolCallResponse;
      return response;
    });
    rpc.listen();
    onNotification('item/agentMessage/delta', TextDelta, (params) => this.delta('text', params));
    onNotification('item/reasoning/summaryTextDelta', TextDelta, (params) =>
      this.delta('reasoning', params),
    );
    onNotification('item/completed', ItemCompleted, ({ threadId, item }) => {
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
    const parsed = PushSyncCall.safeParse(value);
    if (!parsed.success || parsed.data.threadId !== this.threadId) {
      throw new Error('Invalid push_sync call');
    }
    return parsed.data;
  }

  private fail(error: Error) {
    this.terminal.reject(error);
    this.rpc?.dispose();
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
      cwd: '/workspace/session/course',
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
          { ...settings, dynamicTools: [pushSyncTool] } satisfies ThreadStartParams,
          ThreadResult,
        );
    this.threadId = result.thread.id;
    return result.thread.id;
  }

  async run(text: string | ReviewOutcome, accepted: (turnId: string) => void) {
    if (typeof text !== 'string') {
      const saved = await this.request(
        'thread/read',
        {
          threadId: this.threadId!,
          includeTurns: true,
        } satisfies ThreadReadParams,
        ThreadHistory,
      );
      const incorporated = saved.thread.turns.some((turn) =>
        turn.items.some(
          (item) =>
            item.type === 'functionCallOutput' &&
            'name' in item &&
            item.name === 'push_sync' &&
            item.output === JSON.stringify(text),
        ),
      );
      if (incorporated) {
        this.terminal.resolve(undefined);
        return;
      }
    }
    const result = await this.request(
      'turn/start',
      {
        threadId: this.threadId!,
        input: typeof text === 'string' ? [{ type: 'text', text, text_elements: [] }] : [],
        ...(typeof text !== 'string'
          ? {
              toolOutput: {
                name: 'push_sync',
                namespace: null,
                output: JSON.stringify(text),
                retain: true,
              },
            }
          : {}),
      } satisfies TurnStartParams,
      TurnResult,
    );
    this.turnId = result.turn.id;
    accepted(this.turnId);
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

  emit(chunk: UIMessageChunk) {
    this.controller?.enqueue(chunk);
  }

  closeStream(error?: unknown) {
    if (error) this.terminal.reject(error);
    this.rpc?.dispose();
    this.finishResponse(error);
  }

  private finishResponse(error?: unknown) {
    if (!this.controller) return;
    for (const [id, type] of this.parts) {
      this.controller.enqueue({ type: type === 'text' ? 'text-end' : 'reasoning-end', id });
    }
    if (error) {
      this.controller.enqueue({
        type: 'error',
        errorText:
          'The course agent stopped unexpectedly. Resume the conversation to recover your workspace.',
      });
    }
    this.controller.enqueue({ type: 'finish' });
    this.controller.close();
    this.controller = null;
    this.parts.clear();
  }
}

const pushSyncTool: DynamicToolSpec = {
  type: 'function',
  name: 'push_sync',
  description:
    'Request instructor review, Git publication, and Course Sync of the current course edits. Wait for the result; do not push yourself.',
  inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
};
