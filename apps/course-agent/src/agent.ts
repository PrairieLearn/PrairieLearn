import { AIChatAgent } from '@cloudflare/ai-chat';
import { type Sandbox, getSandbox } from '@cloudflare/sandbox';
import {
  type UIMessage,
  type UIMessageChunk,
  createUIMessageStream,
  createUIMessageStreamResponse,
  readUIMessageStream,
} from 'ai';
import { z } from 'zod';

import {
  ChatError,
  type DispatchRequest,
  type ModelGrant,
  type ModelReservation,
  type ModelSettlement,
  type PendingTool,
  type SandboxDiagnostics,
  type ToolOutcome,
  approvalSchema,
  conversationBindingSchema,
  digestBody,
  dispatchRequestSchema,
  executionGrantSchema,
  modelGrantSchema,
  modelReservationSchema,
  modelSettlementSchema,
  readServiceBody,
  toolOutcomeSchema,
  verifyServiceRequest,
} from '@prairielearn/course-agent-contract';
import { assertNever } from '@prairielearn/utils';

import { type AppServer, AppServerError, within } from './app-server.js';
import { cleanupError } from './cleanup-error.js';
import { type CodexTurn, openCodexTurn } from './codex-turn.js';
import {
  type CodexSandbox,
  type CodexState,
  ContainerLost,
  type ModelBinding,
  type Run,
  SANDBOX_IDLE_MS,
  USER_IDLE_MS,
  checkpointCodex,
  connectCodex,
} from './codex.js';
import type { DynamicToolCallResponse } from './generated/v2/DynamicToolCallResponse.js';
import type { Turn } from './generated/v2/Turn.js';
import { callPL } from './pl-api.js';
import { ReceiptStore } from './receipt-store.js';
import { purgeChatStorage } from './retention-store.js';
import { getTool, isPreparedTool, toolResult } from './tools.js';
import { accumulateUsage } from './usage.js';

export interface Env {
  Sandbox: DurableObjectNamespace<Sandbox>;
  Chat: DurableObjectNamespace<Chat>;
  BACKUP_BUCKET: R2Bucket;
  CODEX_MODEL?: string;
  PL_SERVICE_TOKEN?: string;
  PL_API_ORIGIN?: string;
  CODEX_API_KEY?: string;
  GITHUB_CLIENT_TOKEN?: string;
  LOCAL_DEV?: string;
}
interface Expiration {
  id: string;
  reason: 'idle' | 'interaction' | 'retry' | 'startup-cancel' | 'budget' | 'retention';
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

function reservationRefused(error: unknown) {
  return (
    error instanceof ChatError &&
    [
      'budget_limit',
      'turn_limit',
      'hourly_limit',
      'capacity_required',
      'admission_expired',
      'receipt_retention_limit',
    ].includes(error.code)
  );
}

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
  private receiptStore?: ReceiptStore;
  private observers = new Set<() => void>();
  private serviceFlush?: Promise<void>;
  private publicationTask?: Promise<void>;
  private retentionTask?: Promise<void>;
  private expirationTask?: Promise<void>;
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

  override async onStart(...args: Parameters<AIChatAgent<Env, CodexState>['onStart']>) {
    await super.onStart(...args);
    if (
      this.state.serviceScope &&
      !this.getSchedules().some((s) => s.callback === 'checkRetention')
    ) {
      await this.scheduleRetention(86400);
    }
  }

  override async persistMessages(
    ...args: Parameters<AIChatAgent<Env, CodexState>['persistMessages']>
  ) {
    if (this.state.retention) return;
    await super.persistMessages(...args);
    for (const changed of this.observers) changed();
  }

  protected saveState(state: CodexState) {
    if (this.state.retention?.status === 'complete') {
      // Late native callbacks may still finish after deletion; only financial
      // correction evidence can survive, never transcript/runtime state.
      state = {
        serviceScope: this.state.serviceScope,
        retention: this.state.retention,
        modelRequests: state.modelRequests,
        callbackError: state.callbackError,
      };
    }
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
    for (const changed of this.observers) changed();
  }

  /** Called through the trusted outbound binding, never through the public HTTP API. */
  async stopForBudget(binding: ModelBinding, message: string) {
    const { sandboxId } = binding;
    const action = this.state.action;
    if (
      !action ||
      !this.usable(sandboxId) ||
      action.grant.actionId !== binding.actionId ||
      action.grant.id !== binding.capacityGrantId
    ) {
      return;
    }
    this.saveState({ ...this.state, budgetStop: { actionId: action.grant.actionId, message } });
    // Return the deterministic error before interrupting a native request that
    // may still be waiting for this RPC's response.
    this.ctx.waitUntil(
      this.controlTail.then(async () => {
        if (
          this.state.action?.grant.actionId !== binding.actionId ||
          this.state.action.grant.id !== binding.capacityGrantId
        ) {
          return;
        }
        try {
          await this.cancel();
        } catch {
          if (this.state.sandbox?.id === sandboxId) {
            await this.expireSandbox({ id: sandboxId, reason: 'budget' });
          }
        }
      }),
    );
  }

  private activeModelBinding(binding: ModelBinding) {
    const action = this.state.action;
    return (
      !!action &&
      this.usable(binding.sandboxId) &&
      this.state.run?.status === 'running' &&
      action.grant.actionId === binding.actionId &&
      action.grant.id === binding.capacityGrantId &&
      this.now() < action.grant.expiresAt &&
      this.state.budgetStop?.actionId !== binding.actionId
    );
  }

  async authorizeModelCount(binding: ModelBinding) {
    const action = this.state.action;
    if (
      !action ||
      this.state.budgetStop?.actionId === action?.grant.actionId ||
      !this.activeModelBinding(binding) ||
      (action.modelCounts ?? 0) >= action.grant.maxModelRequests
    ) {
      throw new ChatError(429, 'Turn execution limit reached. Send a new message to continue.');
    }
    this.saveState({
      ...this.state,
      action: { ...action, modelCounts: (action.modelCounts ?? 0) + 1 },
    });
    if (this.state.callbackError) {
      throw new ChatError(
        503,
        'Usage reconciliation is paused. Contact your administrator; saved history and Stop remain available.',
      );
    }
    await callPL(this.env, action.scope, '/permissions', {});
  }

  async reserveModelRequest(
    binding: ModelBinding,
    details: Pick<
      ModelReservation,
      'model' | 'requestDigest' | 'inputTokenUpperBound' | 'requestedMaxOutputTokens'
    >,
  ) {
    const action = this.state.action;
    if (!action || !this.activeModelBinding(binding)) {
      throw new ChatError(429, 'Turn budget expired. Send a new message to continue.');
    }
    const input = modelReservationSchema.parse({
      ...details,
      modelRequestId: crypto.randomUUID(),
      actionId: action.grant.actionId,
      capacityGrantId: action.grant.id,
      createdAt: this.now(),
    });
    if (
      Object.values(this.state.modelRequests ?? {}).filter(
        (r) => !r.settled || r.settlement?.kind === 'unknown',
      ).length >= 200
    ) {
      throw new ChatError(429, 'Usage reconciliation is pending.');
    }
    this.saveState({
      ...this.state,
      modelRequests: {
        ...this.state.modelRequests,
        [input.modelRequestId]: { scope: action.scope, input },
      },
    });
    await this.schedule(120, 'flushServiceCallbacks');
    let grant: ModelGrant;
    try {
      grant = modelGrantSchema.parse(await callPL(this.env, action.scope, '/model/reserve', input));
    } catch (error) {
      // Only PL's explicit post-lookup admission refusals prove no reservation.
      // Authentication/configuration errors can hide a previously committed grant.
      if (reservationRefused(error)) {
        const requests = { ...this.state.modelRequests };
        delete requests[input.modelRequestId];
        this.saveState({ ...this.state, modelRequests: requests });
      }
      throw error;
    }
    // Retention may settle the saved input while PL's original grant reply is
    // in flight. It owns reconciliation once the tombstone is present.
    this.assertLive();
    const saved = this.state.modelRequests![input.modelRequestId];
    this.saveState({
      ...this.state,
      modelRequests: { ...this.state.modelRequests, [input.modelRequestId]: { ...saved, grant } },
    });
    return grant;
  }

  async dispatchModelRequest(binding: ModelBinding, reservationId: string) {
    const saved = this.state.modelRequests?.[reservationId];
    if (
      !saved?.grant ||
      saved.sent ||
      this.state.run?.status !== 'running' ||
      this.state.action?.grant.actionId !== saved.input.actionId ||
      this.state.action.grant.id !== saved.input.capacityGrantId ||
      this.state.budgetStop?.actionId === saved.input.actionId ||
      !this.activeModelBinding(binding) ||
      this.now() >= saved.grant.expiresAt
    ) {
      return false;
    }
    await callPL(this.env, saved.scope, '/permissions', {});
    if (
      this.state.modelRequests?.[reservationId]?.sent ||
      this.state.run?.status !== 'running' ||
      this.state.action?.grant.actionId !== saved.input.actionId ||
      this.state.action.grant.id !== saved.input.capacityGrantId ||
      this.state.budgetStop?.actionId === saved.input.actionId ||
      !this.activeModelBinding(binding) ||
      this.now() >= saved.grant.expiresAt
    ) {
      return false;
    }
    // Persist before upstream fetch: a crash cannot authorize a second paid dispatch.
    this.saveState({
      ...this.state,
      modelRequests: { ...this.state.modelRequests, [reservationId]: { ...saved, sent: true } },
    });
    return true;
  }

  async settleModelRequest(value: ModelSettlement) {
    const input = modelSettlementSchema.parse(value);
    const saved = this.state.modelRequests?.[input.reservationId];
    if (!saved) throw new ChatError(409, 'Model request receipt is unavailable.');
    if (input.kind === 'not_sent' && saved.sent) {
      throw new ChatError(409, 'A dispatched request cannot be refunded without provider usage.');
    }
    if (
      saved.settlement?.kind === 'measured' &&
      JSON.stringify(saved.settlement) !== JSON.stringify(input)
    ) {
      throw new ChatError(409, 'Model usage receipt changed.');
    }
    this.saveState({
      ...this.state,
      modelRequests: {
        ...this.state.modelRequests,
        [input.reservationId]: { ...saved, settlement: input, settled: false },
      },
    });
    await this.flushServiceCallbacks();
  }

  private retryServiceCallback(error: unknown) {
    if (
      error instanceof ChatError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 429
    ) {
      this.saveState({ ...this.state, callbackError: messageOf(error) });
      return false;
    }
    return true;
  }

  async flushServiceCallbacks() {
    if (this.state.callbackError) return;
    if (this.serviceFlush) return this.serviceFlush;
    this.serviceFlush = (async () => {
      let retry = false;
      for (const [id, initial] of Object.entries(this.state.modelRequests ?? {})) {
        if (initial.settled) continue;
        try {
          let saved = this.state.modelRequests![id];
          if (!saved.grant) {
            const grant = modelGrantSchema.parse(
              await callPL(this.env, saved.scope, '/model/reserve', saved.input),
            );
            saved = { ...this.state.modelRequests![id], grant };
          }
          if (!saved.settlement && this.now() >= saved.grant!.expiresAt) {
            saved = {
              ...saved,
              settlement: { kind: saved.sent ? 'unknown' : 'not_sent', reservationId: id },
            };
          }
          this.saveState({
            ...this.state,
            modelRequests: { ...this.state.modelRequests, [id]: saved },
          });
          if (saved.settlement) {
            await callPL(this.env, saved.scope, '/model/settle', saved.settlement);
            const settled =
              JSON.stringify(this.state.modelRequests![id].settlement) ===
              JSON.stringify(saved.settlement);
            this.saveState({
              ...this.state,
              modelRequests: {
                ...this.state.modelRequests,
                [id]: {
                  ...this.state.modelRequests![id],
                  settled,
                },
              },
            });
            if (!settled) retry = true;
          } else {
            retry = true;
          }
        } catch (error) {
          if (!initial.grant && !initial.sent && reservationRefused(error)) {
            const requests = { ...this.state.modelRequests };
            delete requests[id];
            this.saveState({ ...this.state, modelRequests: requests });
          } else {
            retry = this.retryServiceCallback(error) || retry;
          }
        }
      }
      const release = this.state.releaseAction;
      if (release) {
        try {
          await callPL(this.env, release.scope, '/execution/release', {
            actionId: release.actionId,
            grantId: release.grantId,
          });
          if (
            this.state.releaseAction?.actionId === release.actionId &&
            this.state.releaseAction.grantId === release.grantId
          ) {
            this.saveState({ ...this.state, releaseAction: undefined });
          }
        } catch (error) {
          retry = this.retryServiceCallback(error) || retry;
        }
      }
      if (
        this.state.finishedAt &&
        this.state.finishedAt !== this.state.completionDeliveredAt &&
        this.state.serviceScope
      ) {
        const at = this.state.finishedAt;
        try {
          await callPL(this.env, this.state.serviceScope, '/conversations/finished', {
            finishedAt: at,
          });
          this.saveState({ ...this.state, completionDeliveredAt: at });
        } catch (error) {
          retry = this.retryServiceCallback(error) || retry;
        }
      }
      const requests = Object.fromEntries(
        Object.entries(this.state.modelRequests ?? {}).filter(
          ([, r]) =>
            !r.settled ||
            (r.settlement?.kind === 'unknown' && this.now() - r.input.createdAt < 7 * 86400000),
        ),
      );
      this.saveState({ ...this.state, modelRequests: requests });
      if (retry && !this.state.callbackError) await this.schedule(30, 'flushServiceCallbacks');
    })().finally(() => {
      this.serviceFlush = undefined;
    });
    return this.serviceFlush;
  }

  private assertLive() {
    if (this.state.retention) {
      throw new ChatError(410, 'This conversation was deleted and cannot be restarted.');
    }
  }

  private async scheduleRetention(seconds: number) {
    for (const schedule of this.getSchedules()) {
      if (schedule.callback === 'checkRetention') await this.cancelSchedule(schedule.id);
    }
    if (
      this.state.serviceScope &&
      (this.state.retention?.status !== 'complete' ||
        Object.keys(this.state.modelRequests ?? {}).length > 0)
    ) {
      await this.schedule(seconds, 'checkRetention', undefined, { idempotent: true });
    }
  }

  /** Physical absence, confirmed destruction and acknowledged settlement precede any purge. */
  async checkRetention() {
    if (this.retentionTask) return this.retentionTask;
    const scope = this.state.serviceScope;
    if (!scope) return;
    this.retentionTask = (async () => {
      let retryAfter = 86400;
      try {
        if (this.state.retention?.status === 'complete') {
          await this.flushServiceCallbacks();
          return;
        }
        const { status } = z
          .object({
            status: z.enum(['present', 'soft_deleted', 'absent']),
          })
          .parse(await callPL(this.env, scope, '/context-status', {}));
        if (status !== 'absent') return;
        this.saveState({
          ...this.state,
          retention: this.state.retention ?? { status: 'pending', requestedAt: this.now() },
        });
        retryAfter = 60;
        this.resetTurnState();
        // An admitted Send may be awaiting a PL grant. Join it before releasing
        // unstarted authorizations so a lost reply cannot leave an active slot.
        await this.controlTail.catch(() => {});
        if (this.state.sandbox) {
          await this.expireSandbox({ id: this.state.sandbox.id, reason: 'retention' });
        }
        if (this.state.sandbox) throw new Error('Sandbox destruction remains unconfirmed.');
        await within(
          this.chatTask ?? Promise.resolve(),
          15_000,
          'Native shutdown remains unconfirmed.',
        );
        await within(
          this.publicationTask ?? Promise.resolve(),
          15_000,
          'Publication callback remains active.',
        );
        if (this.state.action) {
          const { scope: actor, grant } = this.state.action;
          await callPL(this.env, actor, '/execution/release', {
            actionId: grant.actionId,
            grantId: grant.id,
          });
        }
        if (!this.state.retention!.authorizationsReleased) {
          const cursor = this.state.retention!.releaseCursor ?? '';
          const pending = Object.entries({
            ...this.receipts.unstarted(cursor),
            ...Object.fromEntries(
              Object.entries(this.state.executions ?? {}).filter(
                ([id, r]) => id > cursor && r.authorization && !r.authorization.authorized,
              ),
            ),
          })
            .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .slice(0, 100);
          for (const [id, receipt] of pending) {
            const authorization = receipt.authorization!;
            await callPL(this.env, authorization.scope, '/execution/release', {
              actionId: authorization.actionId,
              grantId: id,
            });
            this.saveState({
              ...this.state,
              retention: { ...this.state.retention!, releaseCursor: id },
            });
          }
          if (pending.length === 100) return;
          this.saveState({
            ...this.state,
            retention: { ...this.state.retention!, authorizationsReleased: true },
          });
        }
        this.saveState({
          ...this.state,
          modelRequests: Object.fromEntries(
            Object.entries(this.state.modelRequests ?? {}).map(([id, r]) => [
              id,
              {
                ...r,
                settlement: r.settlement ?? {
                  kind: r.sent ? 'unknown' : 'not_sent',
                  reservationId: id,
                },
              },
            ]),
          ),
        });
        await this.flushServiceCallbacks();
        if (
          this.state.callbackError ||
          this.state.releaseAction ||
          Object.values(this.state.modelRequests ?? {}).some((r) => !r.settled)
        ) {
          throw new Error('Financial reconciliation remains pending.');
        }
        // Only pointers held by this conversation authorize R2 deletion. Save
        // each successful removal before retrying a partially failed purge.
        for (const id of new Set([
          ...(this.state.obsoleteCheckpoints ?? []),
          ...(this.state.checkpoint ? [this.state.checkpoint.backup.id] : []),
        ])) {
          await this.deleteCheckpoint(id);
          this.saveState({
            ...this.state,
            checkpoint: this.state.checkpoint?.backup.id === id ? undefined : this.state.checkpoint,
            obsoleteCheckpoints: this.state.obsoleteCheckpoints?.filter(
              (candidate) => candidate !== id,
            ),
          });
        }
        for (const schedule of this.getSchedules()) await this.cancelSchedule(schedule.id);
        // Use the supported session aperture so the SDK clears chunked bodies,
        // compactions/attachments and its live message mirror together.
        await this.sessions.session().clearMessages();
        await purgeChatStorage(this.ctx.storage);
        this.messages = [];
        this.saveState({
          serviceScope: scope,
          retention: { status: 'complete', requestedAt: this.state.retention!.requestedAt },
          modelRequests: this.state.modelRequests,
        });
      } catch (error) {
        console.error('Conversation retention deferred:', messageOf(error));
        if (!(error instanceof ChatError) || error.status >= 500 || error.status === 429) {
          retryAfter = 60;
        }
      } finally {
        await this.scheduleRetention(retryAfter);
      }
    })().finally(() => {
      this.retentionTask = undefined;
    });
    return this.retentionTask;
  }

  async expireUnstartedAuthorization(input: { commandId: string }) {
    // A lost PL grant reply can consume capacity before any native work starts.
    // Persisted command identity lets eviction recover that slot without replay.
    await this.controlTail;
    const receipt = this.executionReceipts([input.commandId])[input.commandId];
    const authorization = receipt?.authorization;
    if (!authorization || authorization.authorized) return;
    if (this.state.action?.grant.actionId === authorization.actionId) return;
    try {
      await callPL(this.env, authorization.scope, '/execution/release', {
        actionId: authorization.actionId,
        grantId: input.commandId,
      });
    } catch {
      await this.schedule(30, 'expireUnstartedAuthorization', input);
    }
  }

  async expireAction(input: { actionId: string }) {
    if (this.state.action?.grant.actionId !== input.actionId) return;
    if (this.now() < this.state.action.grant.expiresAt) return;
    this.saveState({
      ...this.state,
      budgetStop: {
        actionId: input.actionId,
        message:
          'This turn reached its execution time limit. Your history is saved. Send a new message to continue.',
      },
    });
    try {
      await this.cancel();
    } catch {
      if (this.state.sandbox) {
        await this.expireSandbox({ id: this.state.sandbox.id, reason: 'budget' });
      }
    }
    await this.flushServiceCallbacks();
  }

  async drivePublication(input: { id: string }) {
    if (this.state.retention) return;
    if (this.publicationTask) return this.publicationTask;
    if (this.state.publication?.id !== input.id || this.state.pendingTool?.id !== input.id) return;
    this.publicationTask = (async () => {
      let publication = this.state.publication!;
      if (this.now() > publication.expiresAt) {
        this.saveState({
          ...this.state,
          pendingTool: {
            ...this.state.pendingTool!,
            error:
              'Publication observation expired. Its saved approval and progress remain available in PrairieLearn.',
          },
        });
        return;
      }
      try {
        if (!publication.created) {
          await callPL(this.env, publication.scope, '/publications', {
            id: input.id,
            capture: approvalSchema.parse(this.state.pendingTool!.args),
          });
          if (this.state.retention) return;
          publication = { ...publication, created: true };
          this.saveState({
            ...this.state,
            publication,
            pendingTool: { ...this.state.pendingTool!, args: undefined },
          });
        }
        const value = z
          .discriminatedUnion('status', [
            z.object({ status: z.literal('complete'), result: toolOutcomeSchema }),
            z.object({
              status: z.enum(['awaiting_approval', 'working', 'preparing']),
              error: z.string().nullable(),
              digest: z.string(),
            }),
            z.object({ status: z.literal('absent') }),
          ])
          .parse(
            await callPL(this.env, publication.scope, '/publications/status', { id: input.id }),
          );
        const status = value.status;
        if (this.state.retention) return;
        switch (status) {
          case 'complete': {
            try {
              await this.deliverToolResult({ ...value.result, dispatchId: input.id });
            } catch (error) {
              if (!(error instanceof ChatError) || error.status !== 429) throw error;
              this.saveState({
                ...this.state,
                pendingTool: undefined,
                toolReceipts: {
                  ...this.state.toolReceipts,
                  [input.id]: {
                    result: value.result.result,
                    success: value.result.success !== false,
                  },
                },
              });
            }
            this.saveState({ ...this.state, publication: undefined });
            return;
          }
          case 'absent':
            throw new ChatError(
              409,
              'The publication receipt is missing. Retry preparation in PrairieLearn.',
            );
          case 'working':
          case 'preparing':
          case 'awaiting_approval':
            break;
          default:
            assertNever(status);
        }
        if (!this.state.pendingTool!.prepared && value.status !== 'preparing') {
          this.saveState({
            ...this.state,
            pendingTool: { ...this.state.pendingTool!, prepared: true, error: undefined },
          });
          if (this.state.run) await this.finishRun(this.state.run, this.state.run.status);
        }
        if (value.error === null && publication.attempts) {
          publication = { ...publication, attempts: 0 };
          this.saveState({ ...this.state, publication });
        }
        if (value.status === 'working' && publication.attempts < 3) {
          await callPL(this.env, publication.scope, '/publications/advance', { id: input.id });
        }
        // PG publication progress can change without a native state write.
        // Invalidate connected views after this authoritative status/advance.
        for (const changed of this.observers) changed();
        await this.schedule(30, 'drivePublication', input);
      } catch (error) {
        if (this.state.retention) return;
        if (this.state.publication?.id === input.id) {
          this.saveState({
            ...this.state,
            publication: {
              ...this.state.publication,
              attempts: this.state.publication.attempts + 1,
            },
          });
        }
        this.saveState({
          ...this.state,
          pendingTool: { ...this.state.pendingTool!, error: messageOf(error) },
        });
        if (!(error instanceof ChatError) || error.status >= 500 || error.status === 429) {
          await this.schedule(30, 'drivePublication', input);
        }
      }
    })().finally(() => {
      this.publicationTask = undefined;
    });
    return this.publicationTask;
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
      !this.state.retention &&
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

  private conversationUsage() {
    return {
      ...(this.state.usage ?? {
        version: 0,
        model: this.env.CODEX_MODEL!,
        input: 0,
        cached: 0,
        cacheWrite: 0,
        output: 0,
      }),
      prices: this.state.usagePrices,
    };
  }

  /** HTTP controls and snapshots; AIChatAgent separately owns the resumable message stream. */
  override async onRequest(request: Request) {
    const publicUrl = new URL(request.url);
    let body: string;
    try {
      body = request.method === 'GET' ? '' : await readServiceBody(request.clone());
    } catch {
      return new Response('Request too large', { status: 413 });
    }
    if (body.length > 3_000_000) return new Response('Request too large', { status: 413 });
    const scope = await verifyServiceRequest(
      request,
      this.env.PL_SERVICE_TOKEN ?? '',
      'agent-api',
      body,
    );
    if (!scope) return new Response('Service authentication required', { status: 401 });
    const match =
      /^\/v1\/conversations\/([a-f0-9-]+)(?:\/(snapshot|runtime|diagnostics|events|stream|history|export|messages|stop|cleanup|retention))?$/.exec(
        publicUrl.pathname,
      );
    if (!match || match[1] !== scope.conversationId) {
      return new Response('Not found', { status: 404 });
    }
    const bound = this.state.serviceScope;
    if (
      bound &&
      (bound.conversationId !== scope.conversationId ||
        bound.courseId !== scope.courseId ||
        bound.userId !== scope.userId)
    ) {
      return new Response('Conversation scope changed', { status: 403 });
    }
    const endpoint = match[2];
    if (endpoint === 'retention') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      if (!bound) return new Response('Conversation not configured', { status: 404 });
      if (this.state.callbackError) this.saveState({ ...this.state, callbackError: undefined });
      this.ctx.waitUntil(this.checkRetention());
      return new Response(null, { status: 202 });
    }
    if (this.state.retention) return new Response('Conversation deleted', { status: 410 });
    if (this.state.publication && this.now() > this.state.publication.expiresAt) {
      this.saveState({
        ...this.state,
        publication: {
          ...this.state.publication,
          attempts: 0,
          expiresAt: this.now() + 24 * 60 * 60_000,
        },
      });
      this.ctx.waitUntil(this.drivePublication({ id: this.state.publication!.id }));
    }
    const method =
      endpoint === undefined
        ? 'PUT'
        : ['messages', 'stop', 'cleanup'].includes(endpoint)
          ? 'POST'
          : 'GET';
    if (request.method !== method) return new Response('Method not allowed', { status: 405 });
    const names: Record<string, string> = {
      messages: 'message',
      stop: 'cancel',
      history: 'get-messages',
    };
    publicUrl.pathname = `/private/${endpoint === undefined ? 'configure' : (names[endpoint] ?? endpoint)}`;
    request = new Request(publicUrl, {
      method: endpoint === undefined ? 'POST' : request.method,
      headers: request.headers,
      body: body || undefined,
      signal: request.signal,
    });
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path.endsWith('/events')) {
      const encoder = new TextEncoder();
      let dispose = () => {};
      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          const changed = () => {
            if ((controller.desiredSize ?? 0) > 0) {
              controller.enqueue(encoder.encode('data: {"type":"changed"}\n\n'));
            }
          };
          const timer = setInterval(() => {
            if ((controller.desiredSize ?? 0) > 0) {
              controller.enqueue(encoder.encode(': heartbeat\n\n'));
            }
          }, 20_000);
          const expiry = setTimeout(() => {
            dispose();
            controller.close();
          }, 5 * 60_000);
          dispose = () => {
            clearInterval(timer);
            clearTimeout(expiry);
            this.observers.delete(changed);
            request.signal.removeEventListener('abort', dispose);
          };
          this.observers.add(changed);
          request.signal.addEventListener('abort', dispose, { once: true });
          changed();
        },
        cancel: () => dispose(),
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
      });
    }
    if (request.method === 'GET' && path.endsWith('/stream')) {
      const id = this._activeStreamId;
      if (!id) return new Response(null, { status: 204 });
      const streams = this.streams;

      async function* read() {
        for await (const entry of streams.read(id!, { signal: request.signal })) {
          for (const body of Array.isArray(entry.chunk) ? entry.chunk : [entry.chunk]) {
            yield JSON.parse(z.string().parse(body)) as UIMessageChunk;
          }
        }
      }
      const iterator = read();
      const stream = new ReadableStream<UIMessageChunk>({
        async pull(controller) {
          const next = await iterator.next();
          if (next.done) controller.close();
          else controller.enqueue(next.value);
        },
        async cancel() {
          await iterator.return();
        },
      });
      return createUIMessageStreamResponse({ stream });
    }
    if (request.method === 'POST' && path.endsWith('/configure')) {
      if (!this.env.CODEX_MODEL) {
        return Response.json({ message: 'Course agent model is not configured.' }, { status: 503 });
      }
      const parsed = conversationBindingSchema.safeParse(await request.json());
      if (!parsed.success) {
        return new Response('Invalid course repository', { status: 400 });
      }
      const value = parsed.data;
      const repository = { repository: value.repository, branch: value.branch };
      if (
        this.state.repository &&
        JSON.stringify(this.state.repository) !== JSON.stringify(repository)
      ) {
        return new Response('Conversation destination changed; start a new conversation.', {
          status: 409,
        });
      }
      this.saveState({
        ...this.state,
        repository,
        serviceScope: this.state.serviceScope ?? scope,
        usagePrices: this.state.usagePrices ?? value.modelPrices?.[this.env.CODEX_MODEL],
      });
      await this.scheduleRetention(86400);
      return Response.json({ model: this.env.CODEX_MODEL });
    }
    if (request.method === 'GET' && path.endsWith('/runtime')) {
      return Response.json(
        {
          running: this.state.run?.status === 'running',
          finishedAt: this.state.finishedAt ?? null,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (request.method === 'GET' && path.endsWith('/get-messages')) {
      const parsed = z
        .object({
          cursor: z.string().max(200).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(100),
        })
        .safeParse(Object.fromEntries(publicUrl.searchParams));
      if (!parsed.success) {
        return new Response('Invalid history cursor or page size', { status: 400 });
      }
      const { cursor, limit } = parsed.data;
      const index = cursor === undefined ? -1 : this.messages.findIndex((m) => m.id === cursor);
      if (cursor !== undefined && index === -1) {
        return new Response('History cursor is no longer available. Reload the conversation.', {
          status: 409,
        });
      }
      const messages = this.messages.slice(index + 1, index + 1 + limit);
      return Response.json(
        {
          messages,
          nextCursor: index + 1 + limit < this.messages.length ? messages.at(-1)!.id : null,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (request.method === 'GET' && path.endsWith('/export')) {
      return Response.json(
        {
          version: 1,
          conversationId: scope.conversationId,
          exportedAt: this.now(),
          revision: this.state.revision ?? 0,
          messages: this.messages,
          usage: this.conversationUsage(),
          diagnostics: {
            state: this.state.sandbox?.phase ?? 'absent',
            cleanup: this.state.sandbox?.cleanup,
            checkpointError: this.state.lastCheckpointError,
            idleExpiresAt: this.state.sandbox?.waitingSince
              ? this.state.sandbox.waitingSince + SANDBOX_IDLE_MS
              : null,
            interactionExpiresAt: this.state.sandbox
              ? this.state.sandbox.lastUserInteractionAt + this.interactionTimeoutMs
              : null,
          },
        },
        {
          headers: {
            'Cache-Control': 'no-store',
            'Content-Disposition': 'attachment; filename="conversation.json"',
          },
        },
      );
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
          conversationUsage: this.conversationUsage(),
          revision: this.state.revision ?? 0,
          blocked: !!this.state.pendingTool || this.toolPreparing,
          budgetStop: this.state.budgetStop,
          accountingWarning: this.state.callbackError
            ? 'Usage reconciliation is paused. Contact your administrator; saved history and Stop remain available.'
            : undefined,
          unconfirmedCost:
            Object.values(this.state.modelRequests ?? {}).reduce(
              (cost, r) =>
                cost +
                (r.sent && r.settlement?.kind !== 'measured'
                  ? (r.grant?.reservedCostUnits ?? 0)
                  : 0),
              0,
            ) / 1_000_000,
          pendingTool: this.state.pendingTool,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (request.method === 'POST' && path.endsWith('/cleanup')) {
      const retryCallbacks = !!this.state.callbackError;
      if (retryCallbacks) {
        this.saveState({ ...this.state, callbackError: undefined });
        this.ctx.waitUntil(this.flushServiceCallbacks());
      }
      const sandbox = this.state.sandbox;
      if (!sandbox) return new Response(null, { status: 202 });
      if (
        !sandbox?.cleanup?.error ||
        !['waiting_for_user', 'cleanup_failed'].includes(sandbox.phase)
      ) {
        if (retryCallbacks) return new Response(null, { status: 202 });
        return Response.json({ message: 'No failed cleanup to retry.' }, { status: 409 });
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
          { message: 'Expected a message ID and nonempty text.' },
          { status: 400 },
        );
      }
      input = parsed.data;
    }
    // Serialize short control operations, not whole agent turns. The DO decides start vs. steer.
    const operation = this.controlTail.then(async () => {
      this.assertLive();
      if (!input) return this.cancel();
      const digest = await digestBody(JSON.stringify({ text: input.text }));
      if (this.state.pendingTool || this.toolPreparing) {
        throw new ChatError(409, 'Resolve the pending code change before sending another message.');
      }
      let saved = this.executionReceipts([input.id])[input.id];
      if (saved && saved.digest !== digest) {
        throw new ChatError(409, 'Message identity was reused with different input.');
      }
      if (!saved) {
        if (input.expectedRevision !== (this.state.revision ?? 0)) {
          throw new ChatError(
            409,
            'Conversation changed. Refresh before sending; your draft is preserved.',
          );
        }
        const live = this.state.run?.status === 'running';
        const actionId = live && this.state.action ? this.state.action.grant.actionId : input.id;
        const createdAt = live && this.state.action ? this.state.action.createdAt : this.now();
        const actor = live && this.state.action ? this.state.action.scope : scope;
        await callPL(this.env, scope, '/permissions', {});
        this.assertLive();
        const revision = (this.state.revision ?? 0) + 1;
        saved = {
          digest,
          revision,
          status: 'interrupted',
          authorization: { scope: actor, actionId, createdAt },
        };
        this.saveState({
          ...this.state,
          revision,
          executions: { ...this.state.executions, [input.id]: saved },
        });
        await this.schedule(120, 'expireUnstartedAuthorization', { commandId: input.id });
      }
      if (saved?.authorization && !saved.authorization.authorized) {
        const { scope: actor, actionId, createdAt } = saved.authorization;
        const grant = executionGrantSchema.parse(
          await callPL(this.env, actor, '/execution/authorize', {
            actionId,
            commandId: input.id,
            createdAt,
          }),
        );
        this.assertLive();
        const current = this.state.action;
        this.saveState({
          ...this.state,
          executions: {
            ...this.state.executions,
            [input.id]: { ...saved, authorization: { ...saved.authorization, authorized: true } },
          },
          action:
            current?.grant.actionId === actionId
              ? { ...current, grant }
              : { scope: actor, grant, createdAt, toolCalls: 0 },
          budgetStop:
            this.state.budgetStop?.actionId === actionId ? this.state.budgetStop : undefined,
        });
        await this.schedule(new Date(grant.expiresAt), 'expireAction', { actionId });
      }
      if (
        !this.messages.some((m) => m.id === input!.id) &&
        this.state.action &&
        this.now() >= this.state.action.grant.expiresAt
      ) {
        throw new ChatError(429, 'This turn expired. Send a new message to continue.');
      }
      await this.send({ ...input, dispatchId: input.id });
    });
    this.controlTail = operation.catch(() => {});
    try {
      await operation;
      return Response.json({ revision: this.state.revision ?? 0 });
    } catch (error) {
      return Response.json(
        { message: messageOf(error) },
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
          ...this.state.executions?.[input.id],
          dispatchId: input.dispatchId,
          status: 'completed',
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
   * Admit a prompt checked against the last observed conversation revision, then steer an active turn or start a new one.
   * Return on native acceptance, not completion. Hidden tool results use the same delivery path.
   */
  private async send(input: DispatchRequest, continuation = false) {
    this.assertLive();
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
    this.assertLive();
    if (input.dispatchId && this.rejectedDispatch(input.dispatchId)) {
      throw new ChatError(409, 'Result dispatch was rejected before execution. Retry completion.');
    }
    const success = input.success !== false;
    const receipt = this.state.toolReceipts?.[input.id];
    if (receipt !== undefined) {
      if (receipt.result !== input.result || receipt.success !== success) {
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
      if (!this.state.action) {
        throw new ChatError(
          429,
          'This turn has no remaining execution allowance. Send a new message.',
        );
      }
      const action = this.state.action;
      const grant = executionGrantSchema.parse(
        await callPL(this.env, action.scope, '/execution/authorize', {
          actionId: action.grant.actionId,
          commandId: tool.id,
          createdAt: action.createdAt,
        }),
      );
      this.assertLive();
      this.saveState({ ...this.state, action: { ...action, grant } });
      await this.send(
        {
          id: tool.id,
          text: `${tool.name} result for operation ${tool.id}: ${input.result}`,
          expectedRevision: 0,
          dispatchId: input.dispatchId,
        },
        true,
      );
    }
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
    let payload: unknown;
    try {
      payload = await getTool(name).prepare(this.sandbox(run.sandboxId), args);
    } finally {
      this.toolPreparing = false;
    }
    this.ensureUsable(run.sandboxId);
    if (this.state.run?.id !== run.id || !this.active || this.active.terminal) {
      throw new Error('Tool request is no longer active.');
    }
    const tool: PendingTool = {
      id: crypto.randomUUID(),
      name,
      args: payload,
    };
    const result = new Promise<DynamicToolCallResponse>((resolve) => {
      this.resolveToolResult = resolve;
    });
    this.saveState({ ...this.state, pendingTool: tool });
    captured(tool.id);
    if (!this.state.action) throw new Error('Tool execution allowance is unavailable.');
    this.saveState({
      ...this.state,
      publication: {
        id: tool.id,
        scope: this.state.action.scope,
        created: false,
        attempts: 0,
        expiresAt: this.now() + 24 * 60 * 60_000,
      },
    });
    await this.schedule(1, 'drivePublication', { id: tool.id });
    return result;
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
    if (this.state.retention) return { persist: false, continue: false };
    await this.reconcile();
    return { persist: false, continue: false };
  }

  /** Replace the durable checkpoint pointer before making the previous archive eligible for deletion. */
  private saveCheckpoint(checkpoint: NonNullable<CodexState['checkpoint']>) {
    if (this.state.retention?.status === 'complete') return;
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

  /** Object layout belongs to the pinned Sandbox SDK 0.12.9. */
  protected async deleteCheckpoint(id: string) {
    await within(
      this.env.BACKUP_BUCKET.delete([`backups/${id}/data.sqsh`, `backups/${id}/meta.json`]),
      10_000,
      'Checkpoint deletion remains unconfirmed.',
    );
  }

  /** Retry deletion of obsolete R2 archives only after the container has been destroyed. */
  async pruneCheckpoints() {
    if (this.state.retention) return;
    // A warm restored filesystem may still depend on the previous backup's overlay.
    if (this.state.sandbox) return;
    for (const id of this.state.obsoleteCheckpoints ?? []) {
      if (id === this.state.checkpoint?.backup.id) continue;
      try {
        await this.deleteCheckpoint(id);
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
    if (
      this.usable(id) ||
      (this.state.retention?.status === 'pending' && this.state.sandbox?.id === id)
    ) {
      this.saveCheckpoint({ backup, threadId });
    }
  }

  /** Record completion or a pending tool and arm idle cleanup, without creating a backup. */
  private async finishRun(run: Run, status: Run['status']) {
    if (!this.usable(run.sandboxId)) return;
    if (status !== 'running' && this.state.action) {
      this.saveState({
        ...this.state,
        finishedAt: this.now(),
        releaseAction: {
          scope: this.state.action.scope,
          actionId: this.state.action.grant.actionId,
          grantId: this.state.action.grant.id,
        },
      });
      this.ctx.waitUntil(this.flushServiceCallbacks());
    }
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
      if (this.state.action && this.state.run?.status === 'running') {
        this.saveState({
          ...this.state,
          finishedAt: this.now(),
          releaseAction: {
            scope: this.state.action.scope,
            actionId: this.state.action.grant.actionId,
            grantId: this.state.action.grant.id,
          },
        });
        this.ctx.waitUntil(this.flushServiceCallbacks());
      }
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
    // A retention check must join an idle backup already in flight before
    // destroying the same filesystem or deleting its checkpoint objects.
    const task = (this.expirationTask ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.expireSandboxOnce(expiration));
    this.expirationTask = task;
    try {
      await task;
    } finally {
      if (this.expirationTask === task) this.expirationTask = undefined;
    }
  }

  private async expireSandboxOnce(expiration: Expiration) {
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
      } else if (reason === 'interaction' || reason === 'budget') {
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
    this.assertLive();
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
    if (this.state.usage && this.state.usage.model !== this.env.CODEX_MODEL) {
      throw new Error('The conversation model changed. Start a new conversation.');
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
      // Native lifetime measurements are display/export data, not a spending ledger.
      usage: {
        ...(this.state.usage ?? {
          model: this.env.CODEX_MODEL,
          input: 0,
          cached: 0,
          cacheWrite: 0,
          output: 0,
        }),
        version: (this.state.usage?.version ?? 0) + 1,
      },
      executions: {
        ...this.state.executions,
        [run.messageId]: {
          ...this.state.executions?.[run.messageId],
          dispatchId,
          status: 'running',
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
              onToolStarted: (id) => {
                const action = this.state.action;
                if (!action || action.toolItems?.[id]) return;
                const toolCalls = action.toolCalls + 1;
                this.saveState({
                  ...this.state,
                  action: { ...action, toolCalls, toolItems: { ...action.toolItems, [id]: true } },
                });
                if (toolCalls > action.grant.maxToolCalls) this.ctx.waitUntil(this.cancel());
              },
              threadId: connected.threadId,
              model: this.env.CODEX_MODEL,
              runId: run.id,
              write,
              onToolCall: (params) => {
                if (!isPreparedTool(params.tool)) throw new Error('Unknown tool request.');
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
                const usage = accumulateUsage(this.state.usage!, this.state.usageTotal, total);
                if (usage) {
                  this.saveState({ ...this.state, usage, usageTotal: total });
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
