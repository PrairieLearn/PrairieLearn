import type { UIMessageChunk } from 'ai';
import { type MessageConnection, ParameterStructures } from 'vscode-jsonrpc/browser';
import { z } from 'zod';

import type { InitializeParams } from '../generated/types/InitializeParams.js';
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

/** One app-server connection and its conversion into the chat SDK's output format. */
export class CodexAppServerClient {
  private rpc: MessageConnection | null = null;
  private controller: ReadableStreamDefaultController<UIMessageChunk> | null = null;
  private terminal = Promise.withResolvers<undefined>();
  private turnId: string | null = null;
  private threadId: string | null = null;
  private parts = new Map<string, 'text' | 'reasoning'>();
  readonly stream: ReadableStream<UIMessageChunk>;

  constructor(
    private sandbox: DurableObjectStub<CourseSandbox>,
    messageId: string,
  ) {
    // Setup can fail before the execution helper starts waiting for completion.
    void this.terminal.promise.catch(() => {});
    this.stream = new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        this.controller = controller;
        controller.enqueue({ type: 'start', messageId });
      },
      // The SDK may cancel its reader before native execution has stopped.
      cancel: () => {
        this.controller = null;
      },
    });
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
    rpc.listen();
    onNotification('item/agentMessage/delta', TextDelta, (params) => this.delta('text', params));
    onNotification('item/reasoning/summaryTextDelta', TextDelta, (params) =>
      this.delta('reasoning', params),
    );
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
      : await this.request('thread/start', settings, ThreadResult);
    this.threadId = result.thread.id;
    return result.thread.id;
  }

  async run(text: string, accepted: (turnId: string) => void) {
    const result = await this.request(
      'turn/start',
      {
        threadId: this.threadId!,
        input: [{ type: 'text', text, text_elements: [] }],
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

  closeStream(error?: unknown) {
    if (error) this.terminal.reject(error);
    this.rpc?.dispose();
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
  }
}
