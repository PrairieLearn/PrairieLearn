import { AIChatAgent } from '@cloudflare/ai-chat';
import { getSandbox } from '@cloudflare/sandbox';
import type { Connection, ConnectionContext, WSMessage } from 'agents';
import {
  type UIMessage,
  type UIMessageChunk,
  createUIMessageStream,
  createUIMessageStreamResponse,
  readUIMessageStream,
} from 'ai';

import {
  ChatError,
  type DispatchRequest,
  type PendingTool,
  type SandboxDiagnostics,
  type ToolOutcome,
  admissionReconciliationSchema,
  dispatchRequestSchema,
  preparedToolSchema,
  toolOutcomeSchema,
} from '@prairielearn/course-agent-contract';

import { type AppServer, AppServerError, within } from './app-server.js';
import { cleanupError } from './cleanup-error.js';
import { type CodexTurn, openCodexTurn } from './codex-turn.js';
import {
  type CodexSandbox,
  type CodexState,
  ContainerLost,
  type Run,
  SANDBOX_IDLE_MS,
  USER_IDLE_MS,
  checkpointCodex,
  connectCodex,
} from './codex.js';
import type { DynamicToolCallResponse } from './generated/v2/DynamicToolCallResponse.js';
import type { Turn } from './generated/v2/Turn.js';
import { HostTools } from './host-tools.js';
import { ReceiptStore } from './receipt-store.js';
import type { Sandbox } from './sandbox.js';
import { getTool, isPreparedTool, toolResult } from './tools.js';

export interface Env {
  Sandbox: DurableObjectNamespace<Sandbox>;
  Chat: DurableObjectNamespace<Chat>;
  BACKUP_BUCKET: R2Bucket;
  CODEX_MODEL?: string;
  PL_SERVICE_TOKEN?: string;
  LOCAL_DEV?: string;
  UI_ORIGIN: string;
}
interface Expiration {
  id: string;
  reason: 'idle' | 'interaction' | 'retry' | 'startup-cancel';
  waitingSince?: number;
  attempt?: number;
  retryOf?: string;
}
const MAX_CLEANUP_ATTEMPTS = 3;
const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Codex failed.');
const expiredMessage =
  'User interaction deadline reached. Sandbox cleanup started; another turn must wait for confirmed destruction.';
const interruptedMessage =
  'Task interrupted. It was not automatically repeated. You can send another message to continue.';

function messageDispatchId(message: UIMessage | undefined) {
  const metadata = message?.metadata;
  return metadata &&
    typeof metadata === 'object' &&
    'dispatchId' in metadata &&
    typeof metadata.dispatchId === 'string'
    ? metadata.dispatchId
    : undefined;
}

/**
 * One durable conversation: SQLite owns history, lifecycle state, and execution receipts.
 * Live sockets/promises belong to this instance only; recovery consults Codex native history.
 */
export class Chat extends AIChatAgent<Env, CodexState> {
  initialState: CodexState = {};
  private active?: CodexTurn;
  private hostTools = new HostTools();
  private durableExecutor?: string;
  private receiptStore?: ReceiptStore;
  private get receipts() {
    return (this.receiptStore ??= new ReceiptStore(this.ctx.storage.sql));
  }

  private rejectedDispatch(id: string) {
    return !!this.state.rejectedDispatches?.[id] || this.receipts.rejected(id);
  }

  private executionReceipts(ids: string[]) {
    const archived = this.receipts.executions(ids);
    return Object.fromEntries(
      ids.flatMap((id) => {
        const receipt = this.state.executions?.[id] ?? archived[id];
        return receipt ? [[id, receipt]] : [];
      }),
    );
  }

  protected saveState(state: CodexState) {
    const entries = Object.entries(state.executions ?? {});
    if (entries.length > 100) {
      const recent = new Set(entries.slice(-100).map(([id]) => id));
      const keep = ([id, receipt]: (typeof entries)[number]) =>
        recent.has(id) || receipt.status === 'running' || id === state.run?.messageId;
      this.receipts.saveExecutions(Object.fromEntries(entries.filter((entry) => !keep(entry))));
      state = { ...state, executions: Object.fromEntries(entries.filter(keep)) };
    }
    const rejected = Object.keys(state.rejectedDispatches ?? {});
    if (rejected.length > 100) {
      this.receipts.saveRejections(rejected.slice(0, -100));
      state = {
        ...state,
        rejectedDispatches: Object.fromEntries(
          rejected.slice(-100).map((id) => [id, true as const]),
        ),
      };
    }
    this.setState(state);
  }

  override async onConnect(connection: Connection, context: ConnectionContext) {
    await super.onConnect(connection, context);
    if (
      context.request.headers.get('X-Host-Tools') === '1' &&
      !context.request.headers.has('Origin')
    ) {
      connection.setState({ ...connection.state, hostPeer: true });
    }
  }

  /** Explicit tool frames share the watch socket; SDK chat messages keep their normal path. */
  override async onMessage(connection: Connection, message: WSMessage) {
    if (typeof message === 'string' && message.length <= 1_000_000) {
      let frame: unknown;
      try {
        frame = JSON.parse(message);
      } catch {
        return;
      }
      if (
        frame &&
        typeof frame === 'object' &&
        'type' in frame &&
        typeof frame.type === 'string' &&
        frame.type.startsWith('host-tool')
      ) {
        if (!(connection.state as { hostPeer?: boolean } | null)?.hostPeer) return;
        if (frame.type === 'host-tools-ready') {
          connection.setState({ ...connection.state, hostExecutor: true });
          this.dispatchTool(connection);
        } else if (frame.type === 'host-tool-prepared') {
          const tool = this.state.pendingTool;
          if (
            tool &&
            tool.id === frame.id &&
            !tool.result &&
            this.durableExecutor === connection.id
          ) {
            this.saveState({
              ...this.state,
              pendingTool: { ...tool, prepared: true, error: undefined },
            });
            if (this.state.run && !tool.prepared) {
              await this.finishRun(this.state.run, this.state.run.status);
            }
          }
        } else if (frame.type === 'host-tool-preparation-error') {
          const tool = this.state.pendingTool;
          if (tool && tool.id === frame.id && this.durableExecutor === connection.id) {
            this.durableExecutor = undefined;
            this.saveState({
              ...this.state,
              pendingTool: { ...tool, error: 'Retry preparation.' },
            });
          }
        } else if (frame.type === 'host-tool-result' && frame.outcome) {
          const parsed = toolOutcomeSchema.safeParse(frame.outcome);
          if (!parsed.success || frame.id !== parsed.data.id) return;
          const operation = this.controlTail.then(() => this.deliverToolResult(parsed.data));
          this.controlTail = operation.catch(() => {});
          try {
            await operation;
            connection.send(JSON.stringify({ type: 'host-tool-delivered', id: frame.id }));
          } catch {
            connection.send(
              JSON.stringify({
                type: 'host-tool-delivery-error',
                id: frame.id,
                error: 'Result delivery failed. Retry completion; the saved decision is unchanged.',
              }),
            );
          }
        } else if (frame.type === 'host-tool-result') {
          this.hostTools.receive(connection.id, frame);
        }
        return;
      }
    }
    return super.onMessage(connection, message);
  }

  override async onClose(connection: Connection, code: number, reason: string, wasClean: boolean) {
    this.hostTools.cancel(
      'Host disconnected; outcome may be unknown. It was not retried.',
      connection.id,
    );
    if (this.durableExecutor === connection.id) {
      this.durableExecutor = undefined;
      this.dispatchTool(undefined, connection.id);
    }
    return super.onClose(connection, code, reason, wasClean);
  }

  /** Replay only durable preparation, with a stable ID; PL never publishes on receipt. */
  private dispatchTool(preferred?: Connection, excludedId?: string) {
    const tool = this.state.pendingTool;
    if (!tool || tool.result || this.durableExecutor) return;
    const executor =
      preferred ??
      Array.from(this.getConnections<{ hostExecutor?: boolean }>()).find(
        (c) => c.state?.hostExecutor && c.id !== excludedId,
      );
    if (!executor) return;
    this.durableExecutor = executor.id;
    try {
      executor.send(
        JSON.stringify({
          type: 'host-tool-call',
          id: tool.id,
          name: tool.name,
          input: tool.args,
          sequence: tool.sequence,
        }),
      );
    } catch {
      this.durableExecutor = undefined;
    }
  }

  // Serialize Send/Stop/decisions, not the full model turn: users must retain control while it runs.
  private controlTail: Promise<unknown> = Promise.resolve();
  private chatTask?: Promise<void>;
  private acceptance?: { resolve(): void; reject(error: unknown): void };
  private turnInProgress = false;
  private streamedMessage?: UIMessage;
  // Capture has no resumable work; a DO restart must not preserve an in-flight lock.
  private toolPreparing = false;
  private recovery?: Promise<void>;
  private resolveToolResult?: (result: DynamicToolCallResponse) => void;
  // Cleanup joins setup instead of cancelling individual SDK operations.
  private startup?: Promise<unknown>;

  protected get interactionTimeoutMs() {
    return USER_IDLE_MS;
  }

  protected now() {
    return Date.now();
  }

  protected sandbox(id: string): CodexSandbox {
    return getSandbox(this.env.Sandbox, id, {
      keepAlive: false,
      sleepAfter: '6h',
    });
  }

  private usable(id: string) {
    return (
      this.state.sandbox?.id === id &&
      !['destroying', 'cleanup_failed'].includes(this.state.sandbox.phase)
    );
  }

  private ensureUsable(id: string) {
    if (!this.usable(id)) throw new Error('Sandbox cleanup is pending.');
  }

  private setRun(run: Run) {
    if (this.state.run?.id === run.id && this.usable(run.sandboxId)) {
      this.saveState({ ...this.state, run });
    }
  }

  /** Renew the durable user-interaction deadline; stale alarms are fenced by sandbox identity. */
  private async interaction() {
    const sandbox = this.state.sandbox!;
    this.ensureUsable(sandbox.id);
    const at = this.now();
    const schedule = await this.schedule(
      new Date(Math.ceil((at + this.interactionTimeoutMs) / 1000) * 1000),
      'expireSandbox',
      { id: sandbox.id, reason: 'interaction' } satisfies Expiration,
    );
    this.ensureUsable(sandbox.id);
    this.saveState({
      ...this.state,
      sandbox: {
        ...this.state.sandbox!,
        lastUserInteractionAt: at,
        deadlineSchedule: schedule.id,
      },
    });
    if (sandbox.deadlineSchedule) await this.cancelSchedule(sandbox.deadlineSchedule);
  }

  /** HTTP controls and snapshots; AIChatAgent separately owns the resumable message stream. */
  override async onRequest(request: Request) {
    if (
      request.method === 'POST' &&
      new URL(request.url).pathname.endsWith('/reconcile-admissions')
    ) {
      const parsed = admissionReconciliationSchema.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success) return Response.json({ error: 'Invalid admissions.' }, { status: 400 });
      const operation = this.controlTail.then(() => {
        const rejected: string[] = [];
        for (const admission of parsed.data.admissions) {
          const receipt = this.executionReceipts([admission.id])[admission.id];
          if (
            (receipt && (!receipt.dispatchId || receipt.dispatchId === admission.dispatchId)) ||
            this.state.steering?.[admission.id] ||
            (this.state.run?.messageId === admission.id && this.state.run.status === 'running')
          ) {
            continue;
          }
          rejected.push(admission.dispatchId);
        }
        this.saveState({
          ...this.state,
          rejectedDispatches: {
            ...this.state.rejectedDispatches,
            ...Object.fromEntries(rejected.map((id) => [id, true as const])),
          },
        });
        return rejected;
      });
      this.controlTail = operation.catch(() => {});
      return Response.json({ rejected: await operation });
    }
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && path.endsWith('/tool-prepared')) {
      const parsed = preparedToolSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return Response.json({ error: 'Invalid tool.' }, { status: 400 });
      const operation = this.controlTail.then(async () => {
        const tool = this.state.pendingTool;
        if (!tool || tool.id !== parsed.data.id || tool.result) return;
        this.saveState({
          ...this.state,
          pendingTool: { ...tool, prepared: true, error: undefined },
        });
        if (this.state.run && !tool.prepared) {
          await this.finishRun(this.state.run, this.state.run.status);
        }
      });
      this.controlTail = operation.catch(() => {});
      await operation;
      return new Response(null, { status: 204 });
    }
    if (request.method === 'POST' && path.endsWith('/configure')) {
      if (!this.env.CODEX_MODEL) {
        return Response.json({ error: 'Course agent model is not configured.' }, { status: 503 });
      }
      const value = (await request.json()) as { repository?: unknown; branch?: unknown };
      if (
        typeof value.repository !== 'string' ||
        !/^[\w.-]+\/[\w.-]+$/.test(value.repository) ||
        typeof value.branch !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value.branch) ||
        value.branch.includes('..')
      ) {
        return new Response('Invalid course repository', { status: 400 });
      }
      const repository = { repository: value.repository, branch: value.branch };
      if (
        this.state.repository &&
        JSON.stringify(this.state.repository) !== JSON.stringify(repository)
      ) {
        return new Response('Conversation destination changed; start a new conversation.', {
          status: 409,
        });
      }
      if (!this.state.repository) this.saveState({ ...this.state, repository });
      return Response.json({ model: this.env.CODEX_MODEL });
    }
    if (request.method === 'GET' && path.endsWith('/snapshot')) {
      const requested = new URL(request.url).searchParams.get('ids');
      let ids = Object.keys(this.state.executions ?? {});
      if (requested !== null) {
        let value: unknown;
        try {
          value = JSON.parse(requested);
        } catch {
          return new Response('Invalid receipt IDs', { status: 400 });
        }
        const parsed = dispatchRequestSchema.shape.id.array().max(100).safeParse(value);
        if (!parsed.success) return new Response('Invalid receipt IDs', { status: 400 });
        ids = parsed.data;
      }
      return Response.json(
        {
          messages: this.snapshotMessages(),
          executions: this.executionReceipts(ids),
          operationNumber: 0, // PL supplies the authoritative operation number.
          blocked: !!this.state.pendingTool || this.toolPreparing,
          pendingTool: this.state.pendingTool,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (request.method === 'POST' && path.endsWith('/cleanup')) {
      const sandbox = this.state.sandbox;
      if (
        !sandbox?.cleanup?.error ||
        !['waiting_for_user', 'cleanup_failed'].includes(sandbox.phase)
      ) {
        return Response.json({ error: 'No failed cleanup to retry.' }, { status: 409 });
      }
      this.ctx.waitUntil(
        this.expireSandbox({
          id: sandbox.id,
          reason: sandbox.phase === 'cleanup_failed' ? 'retry' : 'idle',
          waitingSince: sandbox.waitingSince,
        }),
      );
      return new Response(null, { status: 202 });
    }
    if (request.method === 'GET' && path.endsWith('/diagnostics')) {
      const sandbox = this.state.sandbox;
      return Response.json(
        {
          state: sandbox?.phase ?? 'absent',
          cleanup: sandbox?.cleanup,
          checkpointError: this.state.lastCheckpointError,
          idleExpiresAt:
            sandbox?.phase === 'waiting_for_user' && sandbox.waitingSince !== undefined
              ? sandbox.waitingSince + SANDBOX_IDLE_MS
              : null,
          interactionExpiresAt: sandbox
            ? sandbox.lastUserInteractionAt + this.interactionTimeoutMs
            : null,
        } satisfies SandboxDiagnostics,
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (request.method !== 'POST' || (!path.endsWith('/cancel') && !path.endsWith('/message'))) {
      return super.onRequest(request);
    }
    let input: DispatchRequest | undefined;
    if (path.endsWith('/message')) {
      const parsed = dispatchRequestSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) {
        return Response.json(
          { error: 'Expected a message ID and nonempty text.' },
          { status: 400 },
        );
      }
      input = parsed.data;
    }
    // Serialize short control operations, not whole agent turns. The DO decides start vs. steer.
    const operation = this.controlTail.then(() => (input ? this.send(input) : this.cancel()));
    this.controlTail = operation.catch(() => {});
    try {
      await operation;
      return new Response(null, { status: 204 });
    } catch (error) {
      return Response.json(
        { error: messageOf(error) },
        { status: error instanceof ChatError ? error.status : 503 },
      );
    }
  }

  private createObservedStream(options: Parameters<typeof createUIMessageStream>[0]) {
    const stream = createUIMessageStream(options);
    const runId = this.state.run?.id;
    const [response, observation] = stream.tee();
    this.ctx.waitUntil(
      (async () => {
        for await (const message of readUIMessageStream({ stream: observation })) {
          if (this.state.run?.id === runId) this.streamedMessage = message;
        }
      })(),
    );
    return response;
  }

  private snapshotMessages() {
    const streamed = this.streamedMessage;
    if (!streamed) return this.messages;
    const saved = this.messages.some((message) => message.id === streamed.id);
    return saved
      ? this.messages.map((message) => (message.id === streamed.id ? streamed : message))
      : [...this.messages, streamed];
  }

  private async saveSteering(input: DispatchRequest) {
    this.saveState({
      ...this.state,
      steering: {
        ...this.state.steering,
        [input.id]: { ...this.state.steering![input.id], accepted: true },
      },
      executions: {
        ...this.state.executions,
        [input.id]: {
          dispatchId: input.dispatchId,
          status: 'completed',
          model: this.env.CODEX_MODEL!,
          input: 0,
          cached: 0,
          cacheWrite: 0,
          output: 0,
        },
      },
    });
    await this.persistMessages([
      ...this.snapshotMessages(),
      { id: input.id, role: 'user', parts: [{ type: 'text', text: input.text }] },
    ]);
    await this.interaction();
  }

  /**
   * Admit a prompt checked against the last observed operation number, then steer an active turn or start a new one.
   * Return on native acceptance, not completion. Hidden tool results use the same delivery path.
   */
  private async send(input: DispatchRequest, continuation = false) {
    if (input.dispatchId && this.rejectedDispatch(input.dispatchId)) {
      throw new ChatError(409, 'This dispatch was rejected before execution. Retry your message.');
    }
    const existing = this.messages.find((message) => message.id === input.id);
    const oldDispatch = messageDispatchId(existing);
    if (existing && !continuation && !(oldDispatch && this.rejectedDispatch(oldDispatch))) {
      return;
    }
    const steering = this.state.steering?.[input.id];
    if (steering) {
      if (!steering.accepted) {
        let client: AppServer | undefined;
        try {
          this.ensureUsable(steering.sandboxId);
          client = (
            await connectCodex(this.sandbox(steering.sandboxId), this.state, { recovery: true })
          ).client;
          const { thread } = await client.request('thread/read', {
            threadId: steering.threadId,
            includeTurns: true,
          });
          if (
            !thread.turns.some((turn) =>
              turn.items.some((item) => item.type === 'userMessage' && item.clientId === input.id),
            )
          ) {
            throw new Error('Steering acceptance could not be confirmed.');
          }
        } catch {
          throw new ChatError(
            503,
            'Steering delivery is unconfirmed and was not repeated. Inspect the conversation before sending a new request.',
          );
        } finally {
          client?.close();
        }
      }
      await this.saveSteering(input);
      return;
    }
    if (existing && continuation) {
      if (this.state.run?.messageId === input.id && this.state.run.accepted) return;
      if (this.turnInProgress) {
        throw new ChatError(409, 'Approval delivery is still starting. Retry shortly.');
      }
      if (this.state.run?.messageId === input.id && this.state.run.submitted) {
        await this.reconcile();
        if (this.state.run?.accepted) return;
        if (this.state.run?.submitted) {
          throw new ChatError(
            503,
            'Approval delivery is unconfirmed. The outcome remains pending.',
          );
        }
      }
      // A stored UI message is not proof of delivery. Retry only a confirmed pre-submission failure.
      if (this.state.run?.messageId === input.id) this.saveState({ ...this.state, run: undefined });
    }
    if (!continuation) {
      if (!!this.state.pendingTool || this.toolPreparing) {
        throw new ChatError(409, 'Resolve the pending tool before sending another message.');
      }
    }
    const phase = this.state.sandbox?.phase;
    if (phase && ['suspending', 'destroying', 'cleanup_failed'].includes(phase)) {
      throw new ChatError(409, 'Sandbox cleanup is pending. Your message was not sent.');
    }
    if (this.turnInProgress && (!this.active || !this.state.run?.turnId)) {
      throw new ChatError(409, 'Codex is still starting. Retry when startup completes.');
    }
    const lifecycle = this.state.sandbox;
    if (lifecycle && this.now() >= lifecycle.lastUserInteractionAt + this.interactionTimeoutMs) {
      this.ctx.waitUntil(this.expireSandbox({ id: lifecycle.id, reason: 'interaction' }));
      throw new ChatError(409, 'Sandbox expired. Wait for cleanup before sending.');
    }
    if (!this.active && !this.turnInProgress && this.state.run?.status === 'running') {
      await this.reconcile();
    }
    const message = {
      id: input.id,
      role: 'user' as const,
      metadata: {
        ...(continuation ? { source: 'tool-result', toolCallId: input.id } : {}),
        dispatchId: input.dispatchId,
      },
      parts: [{ type: 'text' as const, text: input.text }],
    };
    const run = this.state.run;
    const active = this.active;
    if (active && !active.terminal && run?.threadId && run.turnId) {
      this.ensureUsable(run.sandboxId);
      let steered = false;
      // Persist before the RPC: a lost acknowledgment must not cause duplicate steering.
      this.saveState({
        ...this.state,
        steering: {
          ...this.state.steering,
          [input.id]: { sandboxId: run.sandboxId, threadId: run.threadId, accepted: false },
        },
      });
      try {
        await active.steer({
          threadId: run.threadId,
          expectedTurnId: run.turnId,
          clientUserMessageId: input.id,
          input: [{ type: 'text', text: input.text, text_elements: [] }],
        });
        steered = true;
      } catch (error) {
        // Only a rejected RPC plus a confirmed terminal turn allows start instead.
        // A timeout/disconnect can hide acceptance and must never resubmit the message.
        if (!(error instanceof AppServerError)) throw error;
        const steering = { ...this.state.steering };
        delete steering[input.id];
        this.saveState({ ...this.state, steering });
        if (!active.terminal) {
          const { thread } = await active.client.request('thread/read', {
            threadId: run.threadId,
            includeTurns: true,
          });
          const turn = thread.turns.find((turn) => turn.id === run.turnId);
          if (!turn || turn.status === 'inProgress') throw error;
        }
      }
      if (steered) {
        await this.saveSteering(input);
        return;
      }
    }
    // Finish transcript persistence before the next turn can own the stream.
    await within(
      this.chatTask ?? Promise.resolve(),
      5_000,
      'Previous turn is still finishing. Retry shortly.',
    );
    if (this.state.sandbox && this.state.sandbox.phase !== 'waiting_for_user') {
      throw new ChatError(409, 'Sandbox cleanup is pending. Your message was not sent.');
    }
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const accepted = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.acceptance = { resolve, reject };
    const task = this.saveMessages((messages) => [
      ...messages.filter((saved) => saved.id !== input.id),
      message,
    ])
      .then((result) => {
        reject(new Error(result.error ?? 'Turn ended before startup was confirmed.'));
      })
      .catch((error: unknown) => {
        reject(error);
      });
    this.chatTask = task;
    this.ctx.waitUntil(task);
    try {
      await within(
        accepted,
        25_000,
        'Message acceptance is unconfirmed. Check history before retrying.',
      );
    } finally {
      this.acceptance = undefined;
    }
  }

  /** Deliver the persisted decision to a waiting tool, or resume Codex after sandbox suspension. */
  private async deliverToolResult(input: ToolOutcome) {
    if (input.dispatchId && this.rejectedDispatch(input.dispatchId)) {
      throw new ChatError(409, 'Result dispatch was rejected before execution. Retry completion.');
    }
    const success = input.success !== false;
    const receipt = this.state.toolReceipts?.[input.id];
    if (receipt !== undefined) {
      const saved = typeof receipt === 'string' ? { result: receipt, success: true } : receipt;
      if (saved.result !== input.result || saved.success !== success) {
        throw new ChatError(409, 'A different tool result was already delivered.');
      }
      return;
    }
    const tool = this.state.pendingTool;
    if (!tool || tool.id !== input.id) {
      throw new ChatError(409, 'Tool request is no longer current.');
    }
    if (
      tool.result &&
      (tool.result !== input.result || (tool.resultSuccess !== false) !== success)
    ) {
      throw new ChatError(409, 'Tool result changed.');
    }
    if (input.display) {
      if (input.display.name !== tool.name) {
        throw new ChatError(409, 'Tool display does not match the call.');
      }
      const id = `tool-display-${tool.id}`;
      const display = {
        type: 'data-tool-display' as const,
        data: { id: tool.id, ...input.display },
      };
      const existing = this.messages.find((message) => message.id === id);
      if (existing && JSON.stringify(existing.parts) !== JSON.stringify([display])) {
        throw new ChatError(409, 'Final tool display changed.');
      }
      if (!existing) {
        await this.persistMessages([...this.messages, { id, role: 'assistant', parts: [display] }]);
      }
    }
    this.saveState({
      ...this.state,
      pendingTool: { ...tool, result: input.result, resultSuccess: success },
    });
    if (
      this.state.sandbox &&
      ['suspending', 'destroying', 'cleanup_failed'].includes(this.state.sandbox.phase)
    ) {
      throw new ChatError(409, 'Sandbox cleanup is pending. Retry result delivery after cleanup.');
    }
    if (this.resolveToolResult && this.active && !this.active.terminal) {
      this.saveState({
        ...this.state,
        sandbox: {
          ...this.state.sandbox!,
          phase: 'waiting_for_agent',
          waitingSince: undefined,
          cleanup: undefined,
        },
      });
      await this.interaction();
      this.resolveToolResult(toolResult(input.result, success));
      this.resolveToolResult = undefined;
    } else {
      // The resolver can disappear after PL observes a warm turn. Require a
      // fresh admission before restoring a sandbox and starting another turn.
      if (!input.dispatchId) {
        throw new ChatError(409, 'Cold result delivery needs admission. Retry completion.');
      }
      await this.send(
        {
          id: tool.id,
          text: `${tool.name} result for operation ${tool.id}: ${input.result}`,
          expectedOperationNumber: 0,
          dispatchId: input.dispatchId,
        },
        true,
      );
    }
    this.durableExecutor = undefined;
    this.saveState({
      ...this.state,
      pendingTool: undefined,
      toolReceipts: { [input.id]: { result: input.result, success } },
    });
  }

  /** Persist the gate before waiting, including across sandbox suspension and DO restart. */
  private async requestTool(name: string, args: unknown, captured: (id: string) => void) {
    // Native tool requests arrive concurrently, including while capture awaits sandbox I/O.
    if (this.state.pendingTool || this.toolPreparing) {
      throw new Error('A tool decision is already pending.');
    }
    const run = this.state.run!;
    this.toolPreparing = true;
    let payload;
    try {
      payload = await getTool(name).prepare(this.sandbox(run.sandboxId), args);
    } finally {
      this.toolPreparing = false;
    }
    this.ensureUsable(run.sandboxId);
    if (this.state.run?.id !== run.id || !this.active || this.active.terminal) {
      throw new Error('Tool request is no longer active.');
    }
    const sequence = (this.state.toolSequence ?? 0) + 1;
    const tool: PendingTool = {
      id: crypto.randomUUID(),
      sequence,
      name,
      args: payload,
    };
    const result = new Promise<DynamicToolCallResponse>((resolve) => {
      this.resolveToolResult = resolve;
    });
    this.saveState({ ...this.state, toolSequence: sequence, pendingTool: tool });
    captured(tool.id);
    this.durableExecutor = undefined;
    this.dispatchTool();
    // The immutable payload is already durable in the DO. A disconnected PL webserver must not keep compute alive forever.
    await this.schedule(15, 'expireToolPreparation', { id: tool.id });
    return result;
  }

  /** A durable one-shot deadline survives DO eviction; human approval itself has no RPC timeout. */
  async expireToolPreparation({ id }: { id: string }) {
    const tool = this.state.pendingTool;
    if (!tool || tool.id !== id || tool.prepared || tool.result) return;
    this.saveState({
      ...this.state,
      pendingTool: {
        ...tool,
        error: 'PL has not acknowledged preparation. Reconnect the page to retry.',
      },
    });
    if (this.state.run) await this.finishRun(this.state.run, this.state.run.status);
  }

  /** Ask Codex to interrupt; cancellation is distinct from closing a browser stream. */
  private async cancel() {
    const run = this.state.run;
    if (run?.status !== 'running') return;
    this.ensureUsable(run.sandboxId);
    if (this.turnInProgress && !run.submitted) {
      this.setRun({ ...run, cancelRequested: true });
      return;
    }
    const active = this.active;
    if (active && run.threadId && run.turnId) {
      await active.interrupt(run.turnId);
      await this.interaction();
      await within(active.completed, 5_000, 'Stop is unconfirmed. Another turn remains blocked.');
    } else if (this.turnInProgress) {
      throw new Error('Native turn acceptance is pending. Try Stop again shortly.');
    } else {
      await this.reconcile();
    }
  }

  protected override async onChatRecovery() {
    await this.reconcile();
    return { persist: false, continue: false };
  }

  /** Replace the durable checkpoint pointer before making the previous archive eligible for deletion. */
  private saveCheckpoint(checkpoint: NonNullable<CodexState['checkpoint']>) {
    const previous = this.state.checkpoint?.backup.id;
    this.saveState({
      ...this.state,
      checkpoint: { ...checkpoint, usageTotal: this.state.usageTotal },
      lastCheckpointError: undefined,
      obsoleteCheckpoints: [
        ...new Set([
          ...(this.state.obsoleteCheckpoints ?? []),
          ...(previous && previous !== checkpoint.backup.id ? [previous] : []),
        ]),
      ],
    });
  }

  /** Retry deletion of obsolete R2 archives only after the container has been destroyed. */
  async pruneCheckpoints() {
    // A warm restored filesystem may still depend on the previous backup's overlay.
    if (this.state.sandbox) return;
    for (const id of this.state.obsoleteCheckpoints ?? []) {
      if (id === this.state.checkpoint?.backup.id) continue;
      try {
        // Object layout belongs to the pinned Sandbox SDK 0.12.9.
        await within(
          this.env.BACKUP_BUCKET.delete([`backups/${id}/data.sqsh`, `backups/${id}/meta.json`]),
          10_000,
          'Backup deletion timed out.',
        );
      } catch {
        console.error('Could not remove superseded checkpoint; retrying in 60 seconds.');
        await this.schedule(60, 'pruneCheckpoints');
        return;
      }
      this.saveState({
        ...this.state,
        obsoleteCheckpoints: this.state.obsoleteCheckpoints?.filter(
          (candidate) => candidate !== id,
        ),
      });
    }
  }

  /** Save workspace files and the native thread ID together; UI history remains in the Chat DO. */
  private async checkpoint(id: string) {
    const sandbox = this.sandbox(id);
    const threadId = this.state.threadId;
    const backup = await within(
      (async () => {
        if (!(await sandbox.exists('/tmp/codex-app-server-ready')).exists) {
          throw new ContainerLost();
        }
        this.ensureUsable(id);
        return checkpointCodex(sandbox, this.env.LOCAL_DEV === 'true');
      })(),
      60_000,
      'Backup timed out.',
    );
    if (this.usable(id)) this.saveCheckpoint({ backup, threadId });
  }

  /** Record completion or a pending tool and arm idle cleanup, without creating a backup. */
  private async finishRun(run: Run, status: Run['status']) {
    if (!this.usable(run.sandboxId)) return;
    if (this.state.sandbox?.phase === 'suspending') {
      this.saveState({ ...this.state, run: { ...this.state.run!, status } });
      return;
    }
    if (this.state.executions?.[run.messageId]) {
      this.saveState({
        ...this.state,
        executions: {
          ...this.state.executions,
          [run.messageId]: { ...this.state.executions[run.messageId], status },
        },
      });
    }
    const waitingSince = this.now();
    this.saveState({
      ...this.state,
      run: { ...this.state.run!, status },
      sandbox: {
        ...this.state.sandbox!,
        phase: 'waiting_for_user',
        waitingSince,
      },
    });
    await this.schedule(
      new Date(Math.ceil((waitingSince + SANDBOX_IDLE_MS) / 1000) * 1000),
      'expireSandbox',
      { id: run.sandboxId, reason: 'idle', waitingSince } satisfies Expiration,
    );
  }

  // After connection/DO loss, stop surviving work before allowing another prompt.
  // A missing acknowledgment never causes an automatic replay of turn/start.
  private reconcile(): Promise<void> {
    if (this.recovery) return this.recovery;
    this.recovery = this.reconcileRun().finally(() => {
      this.recovery = undefined;
    });
    return this.recovery;
  }

  /** Inspect surviving native history without replaying an uncertain prompt or restoring a lost container. */
  private async reconcileRun() {
    const run = this.state.run;
    if (run?.status !== 'running' || this.active) return;
    this.ensureUsable(run.sandboxId);
    let client: AppServer | undefined;
    let outcome = interruptedMessage;
    let status: Run['status'] = 'interrupted';
    try {
      const connection = await connectCodex(this.sandbox(run.sandboxId), this.state, {
        recovery: true,
      });
      client = connection.client;
      this.ensureUsable(run.sandboxId);
      if (run.threadId) {
        const { thread } = await client.request('thread/resume', {
          threadId: run.threadId,
        });
        const turn = thread.turns.find((turn) => turn.status === 'inProgress');
        if (turn) {
          let resolve!: (turn: Turn) => void;
          const done = new Promise<Turn>((r) => {
            resolve = r;
          });
          const unsubscribe = client.subscribe((event) => {
            if (
              event.method === 'turn/completed' &&
              event.params.threadId === run.threadId &&
              event.params.turn.id === turn.id
            ) {
              resolve(event.params.turn);
            }
          });
          try {
            await client.request('turn/interrupt', {
              threadId: run.threadId,
              turnId: turn.id,
            });
            await within(
              Promise.race([done, client.disconnected]),
              5_000,
              'Recovery could not confirm Stop.',
            );
          } finally {
            unsubscribe();
          }
        }
        // Inspect again after interruption: do not infer completion from the RPC acknowledgment.
        const current = (
          await client.request('thread/read', {
            threadId: run.threadId,
            includeTurns: true,
          })
        ).thread;
        if (current.turns.some((turn) => turn.status === 'inProgress')) {
          throw new Error('Codex is still active.');
        }
        const completed =
          current.turns.find((turn) => turn.id === run.turnId) ??
          current.turns.find((turn) =>
            turn.items.some(
              (item) => item.type === 'userMessage' && item.clientId === run.messageId,
            ),
          );
        this.setRun({
          ...this.state.run!,
          accepted: !!completed,
          submitted: !!completed,
          turnId: completed?.id,
        });
        if (completed?.status === 'completed') {
          status = 'completed';
          outcome =
            completed.items
              .filter((item) => item.type === 'agentMessage')
              .map((item) => item.text)
              .join('\n') || 'Turn completed before reconnection.';
        } else if (completed?.status === 'failed') {
          status = 'failed';
          outcome = `Task failed: ${completed.error?.message ?? 'Codex turn failed.'}`;
        }
      }
      await this.finishRun(run, status);
    } catch (error) {
      if (!(error instanceof ContainerLost)) throw error;
      // No surviving execution, but the old generation must still be cleaned up.
      await this.destroyGeneration(run.sandboxId);
      outcome = error.message;
    } finally {
      client?.close();
    }
    await this.persistMessages([
      ...this.messages.filter((message) => message.id !== `codex-${run.id}`),
      {
        id: `codex-${run.id}`,
        role: 'assistant',
        parts: [{ type: 'text', text: outcome }],
      },
    ]);
  }

  /** Destroy this generation, then clear its durable lease; never clear a newer sandbox by accident. */
  private async destroyGeneration(id: string) {
    if (this.state.sandbox?.id !== id) return;
    this.saveState({
      ...this.state,
      sandbox: { ...this.state.sandbox, phase: 'destroying' },
    });
    this.active?.client.close();
    try {
      await within(this.sandbox(id).destroy(), 30_000, 'Sandbox destruction unconfirmed.');
      if (this.state.sandbox?.id !== id) return;
      if (this.state.obsoleteCheckpoints?.length) await this.schedule(60, 'pruneCheckpoints');
      this.saveState({
        ...this.state,
        sandbox: undefined,
        executions: Object.fromEntries(
          Object.entries(this.state.executions ?? {}).map(([key, value]) => [
            key,
            { ...value, status: value.status === 'running' ? 'interrupted' : value.status },
          ]),
        ),
        threadId: this.state.checkpoint?.threadId,
        run:
          this.state.run?.status === 'running'
            ? { ...this.state.run, status: 'interrupted' }
            : this.state.run,
      });
      await this.pruneCheckpoints();
    } catch (error) {
      if (this.state.sandbox?.id === id) {
        this.saveState({
          ...this.state,
          sandbox: { ...this.state.sandbox, phase: 'cleanup_failed' },
        });
      }
      throw error;
    }
  }

  /**
   * Durable alarm: stop, checkpoint, then destroy. Idle backup failure retains the box for retry;
   * the interaction deadline still destroys it and preserves a visible data-loss warning.
   */
  async expireSandbox(expiration: Expiration) {
    const { id, reason, attempt = 0 } = expiration;
    const state = this.state.sandbox;
    if (!state || state.id !== id) return;
    if (expiration.retryOf && expiration.retryOf !== state.cleanup?.id) return;
    if (
      reason === 'idle' &&
      (state.phase !== 'waiting_for_user' ||
        state.waitingSince !== expiration.waitingSince ||
        this.now() < (state.waitingSince ?? this.now()) + SANDBOX_IDLE_MS)
    ) {
      return;
    }
    if (
      reason === 'interaction' &&
      this.now() < state.lastUserInteractionAt + this.interactionTimeoutMs
    ) {
      return;
    }
    if (reason === 'retry' && state.phase !== 'cleanup_failed') return;
    // Setup may still be restoring files or opening a native thread. Fence sends,
    // then join it before any checkpoint/destruction can touch the same container.
    if (this.startup) {
      this.saveState({
        ...this.state,
        sandbox: { ...state, phase: 'destroying' },
      });
      await this.startup.catch(() => {});
      if (this.state.sandbox?.id !== id) return;
    }
    let checkpointOnly = reason === 'idle' || reason === 'startup-cancel';
    const cleanup = {
      id: crypto.randomUUID(),
      attempts: attempt + 1,
      retryAt: null,
    };
    let stage: 'stop' | 'backup' | 'destroy' = reason === 'retry' ? 'destroy' : 'stop';
    const reportStage = () => {
      if (this.state.sandbox?.id === id) {
        this.saveState({
          ...this.state,
          sandbox: {
            ...this.state.sandbox,
            cleanup: { ...cleanup, stage },
          },
        });
      }
    };
    reportStage();
    try {
      if (reason === 'idle' || reason === 'startup-cancel') {
        this.saveState({
          ...this.state,
          sandbox: { ...this.state.sandbox!, phase: 'suspending' },
        });
        if (!!this.state.pendingTool && this.state.run?.status === 'running' && !this.active) {
          await this.reconcile();
        }
        if (this.state.sandbox?.id !== id) return;
        if (this.active && this.state.run?.turnId && !!this.state.pendingTool) {
          const active = this.active;
          const turnId = this.state.run.turnId;
          await within(
            active.interrupt(turnId).then(() => active.completed),
            5000,
            'Could not stop pending tool turn.',
          );
          await within(this.chatTask ?? Promise.resolve(), 5_000, 'Chat shutdown timed out.');
        }
        this.saveState({
          ...this.state,
          sandbox: { ...this.state.sandbox!, phase: 'suspending' },
        });
        stage = 'backup';
        reportStage();
        await this.checkpoint(id);
        if (!this.usable(id)) return;
      } else if (reason === 'interaction') {
        this.saveState({
          ...this.state,
          sandbox: { ...this.state.sandbox!, phase: 'destroying' },
        });
        const active = this.active;
        const run = this.state.run;
        try {
          if (run?.status === 'running' && run.submitted) {
            if (!active || !run.threadId || !run.turnId) {
              throw new Error('Native execution is unconfirmed; skip final backup.');
            }
            await within(
              active.interrupt(run.turnId).then(() => active.completed),
              5_000,
              'Deadline Stop timed out.',
            );
          }
          const backup = await within(
            checkpointCodex(this.sandbox(id), this.env.LOCAL_DEV === 'true'),
            60_000,
            'Deadline checkpoint timed out.',
          );
          if (this.state.sandbox?.id === id) {
            this.saveCheckpoint({ backup, threadId: this.state.threadId });
          }
        } catch (error) {
          this.saveState({
            ...this.state,
            lastCheckpointError: `Final checkpoint unavailable; changes since the last checkpoint may be lost. ${cleanupError('backup', error)}`,
          });
        }
      }
      checkpointOnly = false;
      stage = 'destroy';
      reportStage();
      await this.destroyGeneration(id);
    } catch (error) {
      console.error('Sandbox cleanup failed:', cleanupError(stage, error));
      if (this.state.sandbox?.id !== id) return;
      if (checkpointOnly) {
        if (!this.usable(id)) return;
        this.saveState({
          ...this.state,
          sandbox: { ...this.state.sandbox, phase: 'waiting_for_user' },
        });
      }
      const retryAt = attempt + 1 < MAX_CLEANUP_ATTEMPTS ? this.now() + 30_000 : null;
      this.saveState({
        ...this.state,
        sandbox: {
          ...this.state.sandbox!,
          cleanup: {
            ...cleanup,
            stage,
            error: cleanupError(stage, error),
            retryAt,
          },
        },
      });
      if (retryAt !== null) {
        await this.schedule(30, 'expireSandbox', {
          ...expiration,
          reason: checkpointOnly ? 'idle' : 'retry',
          attempt: attempt + 1,
          retryOf: cleanup.id,
        });
      }
    }
  }

  /**
   * AIChatAgent invokes this after saving the admitted user message. Run Codex independently of
   * browser connectivity and return AI SDK chunks for the library to stream and persist.
   */
  override async onChatMessage() {
    const acceptance = this.acceptance;
    const message = this.messages.findLast((message) => message.role === 'user');
    const prompt = message?.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
    if (!message || !prompt) throw new Error('Send a text prompt to Codex.');
    const dispatchId = messageDispatchId(message);
    const checkDispatch = () => {
      if (dispatchId && this.rejectedDispatch(dispatchId)) {
        throw new ChatError(409, 'Message rejected before execution. Retry your message.');
      }
    };
    checkDispatch();
    if (this.turnInProgress) throw new Error('The previous Codex run is still active.');
    if (this.state.run?.messageId === message.id) {
      throw new Error('This prompt was already attempted. Send a new message.');
    }
    const old = this.state.sandbox;
    if (
      old &&
      (old.phase === 'cleanup_failed' ||
        this.now() >= old.lastUserInteractionAt + this.interactionTimeoutMs)
    ) {
      await this.expireSandbox({
        id: old.id,
        reason: old.phase === 'cleanup_failed' ? 'retry' : 'interaction',
        attempt: MAX_CLEANUP_ATTEMPTS - 1,
      });
      if (this.state.sandbox) throw new Error('Sandbox cleanup is pending.');
    }
    if (this.state.run?.status === 'running') await this.reconcile();
    if (this.state.sandbox && this.state.sandbox.phase !== 'waiting_for_user') {
      throw new Error('Sandbox cleanup is pending.');
    }
    if (!this.state.repository) throw new Error('Course repository is not configured.');
    if (!this.env.CODEX_MODEL) {
      throw new Error('Configure CODEX_MODEL before running the course agent.');
    }
    checkDispatch();
    if (!this.state.sandbox && this.state.checkpoint) {
      this.saveState({ ...this.state, usageTotal: this.state.checkpoint.usageTotal });
    }
    const fresh = !this.state.sandbox && !this.state.checkpoint;
    const sandbox = this.state.sandbox ?? {
      id: crypto.randomUUID(),
      phase: 'starting' as const,
      lastUserInteractionAt: this.now(),
    };
    const run: Run = {
      id: crypto.randomUUID(),
      messageId: message.id,
      sandboxId: sandbox.id,
      status: 'running',
    };
    this.saveState({
      ...this.state,
      executions: {
        ...this.state.executions,
        [run.messageId]: {
          dispatchId,
          status: 'running',
          model: this.env.CODEX_MODEL,
          input: null,
          cached: null,
          cacheWrite: null,
          output: null,
        },
      },
      run,
      sandbox: {
        ...sandbox,
        phase: this.state.sandbox ? 'waiting_for_agent' : 'starting',
        waitingSince: undefined,
        cleanup: undefined,
      },
    });
    this.turnInProgress = true;
    try {
      await this.interaction();
    } catch (error) {
      this.saveState({
        ...this.state,
        run: { ...run, status: 'failed' },
        sandbox: {
          ...this.state.sandbox!,
          phase: 'waiting_for_user',
          waitingSince: this.now(),
        },
      });
      this.turnInProgress = false;
      throw error;
    }
    this.streamedMessage = undefined;
    return createUIMessageStreamResponse({
      stream: this.createObservedStream({
        onError: messageOf,
        execute: async ({ writer }) => {
          const write = (chunk: UIMessageChunk) => writer.write(chunk);
          let client: AppServer | undefined;
          let execution: CodexTurn | undefined;
          let terminal = false;
          let failure: unknown;
          let status: Run['status'] = 'failed';
          write({
            type: 'start',
            messageId: `codex-${run.id}`,
            messageMetadata: { runId: run.id },
          });
          try {
            const connecting = connectCodex(this.sandbox(sandbox.id), this.state, {
              repository: this.state.repository?.repository,
              branch: this.state.repository?.branch,
              onCheckpointUnavailable: (warning) => {
                this.saveState({ ...this.state, lastCheckpointError: warning });
              },
            });
            this.startup = connecting;
            const connected = await connecting;
            client = connected.client;
            this.ensureUsable(sandbox.id);
            if (this.state.run?.cancelRequested) throw new Error('Startup cancelled.');
            if (connected.warning) {
              const id = `${run.id}:restore-warning`;
              write({ type: 'text-start', id });
              write({ type: 'text-delta', id, delta: connected.warning });
              write({ type: 'text-end', id });
            }
            this.ensureUsable(sandbox.id);
            const opening = openCodexTurn(client, {
              threadId: connected.threadId,
              model: this.env.CODEX_MODEL,
              development: this.env.LOCAL_DEV === 'true',
              runId: run.id,
              write,
              onToolCall: (params) => {
                if (!isPreparedTool(params.tool)) {
                  return this.hostTools.call(
                    params.tool,
                    params.arguments,
                    Array.from(this.getConnections<{ hostExecutor?: boolean }>()).filter(
                      (c) => c.state?.hostExecutor,
                    ),
                  );
                }
                if (
                  params.threadId !== this.state.threadId ||
                  params.turnId !== this.state.run?.turnId
                ) {
                  throw new Error('Unknown tool request.');
                }
                return Promise.race([
                  this.requestTool(params.tool, params.arguments, (id) =>
                    write({
                      type: 'data-tool',
                      id,
                      data: { id, name: params.tool },
                    }),
                  ),
                  client!.disconnected,
                ]);
              },
              onUsage: (total) => {
                const before =
                  this.state.usageTotal?.threadId === total.threadId
                    ? this.state.usageTotal
                    : { input: 0, cached: 0, cacheWrite: 0, output: 0 };
                const current = this.state.executions?.[run.messageId];
                if (
                  current &&
                  total.input >= before.input &&
                  total.cached >= before.cached &&
                  (before.cacheWrite === undefined || total.cacheWrite >= before.cacheWrite) &&
                  total.output >= before.output
                ) {
                  this.saveState({
                    ...this.state,
                    usageTotal: total,
                    executions: {
                      ...this.state.executions,
                      [run.messageId]: {
                        ...current,
                        input: (current.input ?? 0) + total.input - before.input,
                        cached: (current.cached ?? 0) + total.cached - before.cached,
                        // Older checkpoints lack a cache-write baseline; that cost remains unknown.
                        cacheWrite:
                          before.cacheWrite === undefined ||
                          (current.input !== null && current.cacheWrite == null)
                            ? null
                            : (current.cacheWrite ?? 0) + total.cacheWrite - before.cacheWrite,
                        output: (current.output ?? 0) + total.output - before.output,
                      },
                    },
                  });
                }
              },
              onTurnStarted: (turnId) =>
                this.setRun({ ...this.state.run!, turnId, accepted: true }),
            });
            this.startup = opening;
            execution = await opening;
            this.startup = undefined;
            this.ensureUsable(sandbox.id);
            if (this.state.run?.cancelRequested) throw new Error('Startup cancelled.');
            this.active = execution;
            this.saveState({
              ...this.state,
              threadId: execution.threadId,
              run: { ...run, threadId: execution.threadId, submitted: true },
              sandbox: { ...this.state.sandbox!, phase: 'waiting_for_agent' },
            });
            const started = await execution.start(prompt, message.id);
            this.setRun({
              ...this.state.run!,
              turnId: started.id,
              accepted: true,
            });
            acceptance?.resolve();
            const turn = await execution.completed;
            terminal = true;
            status =
              turn.status === 'completed'
                ? 'completed'
                : turn.status === 'interrupted'
                  ? 'cancelled'
                  : 'failed';
            if (status === 'failed') {
              failure = new Error(turn.error?.message ?? 'Codex turn failed.');
            }
            if (this.usable(run.sandboxId)) await this.finishRun(run, status);
          } catch (error) {
            this.startup = undefined;
            acceptance?.reject(error);
            failure = error;
            if (error instanceof AppServerError && !this.state.run?.accepted) {
              this.setRun({ ...this.state.run!, submitted: false });
            }
            // Only a fresh, never-submitted workspace is disposable. Preserve restored/warm work.
            if (!this.state.run?.submitted && this.usable(run.sandboxId)) {
              try {
                const cancelled = !!this.state.run?.cancelRequested;
                this.hostTools.cancel('Native turn ended before host completion.');
                await execution?.close();
                execution = undefined;
                client?.close();
                await this.finishRun(run, cancelled ? 'cancelled' : 'failed');
                if (cancelled && !fresh) {
                  await this.expireSandbox({
                    id: run.sandboxId,
                    reason: 'startup-cancel',
                  });
                } else if (fresh) {
                  this.saveState({
                    ...this.state,
                    sandbox: {
                      ...this.state.sandbox!,
                      phase: 'cleanup_failed',
                    },
                  });
                  await this.expireSandbox({
                    id: run.sandboxId,
                    reason: 'retry',
                  });
                }
              } catch {
                /* Lifecycle diagnostics retain unconfirmed destruction; keep the startup error. */
              }
            }
          } finally {
            this.hostTools.cancel('Native turn ended before host completion.');
            await execution?.close();
            client?.close();
            this.active = undefined;
            this.resolveToolResult?.(
              toolResult('Turn ended. Tool result will be delivered on continuation.'),
            );
            this.resolveToolResult = undefined;
            if (!failure && !this.usable(run.sandboxId)) failure = new Error(expiredMessage);
            if (failure) {
              const id = `${run.id}:error`;
              write({ type: 'text-start', id });
              write({
                type: 'text-delta',
                id,
                delta: `Task failed: ${messageOf(failure)}`,
              });
              write({ type: 'text-end', id });
            } else if (terminal && status === 'cancelled') {
              write({ type: 'abort' });
            }
            write({ type: 'finish', finishReason: failure ? 'error' : 'stop' });
            this.turnInProgress = false;
          }
        },
      }),
    });
  }
}
