import {
  AIChatAgent,
  type ChatResponseResult,
  type OnChatMessageOptions,
} from '@cloudflare/ai-chat';
import { MessageType } from '@cloudflare/ai-chat/types';
import type { DirectoryBackupRecord } from '@cloudflare/sandbox';
import type { Connection, ConnectionContext } from 'agents';
import { type UIMessage, createUIMessageStreamResponse, parseJsonEventStream } from 'ai';
import { z } from 'zod';

import {
  type BlockedReason,
  type ConversationLifecycle,
  type ConversationState,
  type RequestChangesResult,
  RequestChangesResultSchema,
  type Review,
  type ReviewSnapshot,
  type Usage,
  UsageDecisionSchema,
  type UsageReport,
  UsageSchema,
  UserMessageMetadataSchema,
  addUsage,
  emptyUsage,
  isEmptyUsage,
  reviewTag,
} from '@prairielearn/course-agent-types';

import { logEvent, reportError } from '../monitoring.js';
import { CodexAppServerClient, type TurnInput } from '../sandbox/codex.js';
import type { CourseSource } from '../sandbox/sandbox.js';
import { SandboxTurn } from '../sandbox/turn.js';

import {
  type Attachment,
  IMAGE_SIGNATURE_BYTES,
  UploadQuota,
  attachmentPath,
  attachmentsOf,
  attachmentsToWrite,
  formatRequest,
  isImage,
  keepUploadReferences,
  uploadKey,
  uploadPrefix,
} from './attachments.js';
import {
  buildCatchUp,
  denialMarker,
  describeDenialMessage,
  describeReviewResult,
  historyBefore,
  messageTag,
  missedTurns,
  nextUserMessage,
  summarizeReview,
  turnMarker,
} from './catch-up.js';
import { buildInstructions, describePageLocation } from './instructions.js';
import { generateTitle } from './title.js';

// PrairieLearn proxies chat sockets through a load balancer that closes connections after 60 s
// without traffic, including idle chats and long silent turns.
const KEEPALIVE_SECONDS = 25;

export interface BudgetState {
  /** Usage PrairieLearn has not recorded, excluding a report that is being sent. */
  unreported: Usage;
  /** The report being sent. A retry resends it unchanged, so PrairieLearn records it once. */
  pending: UsageReport | null;
  /**
   * Set when the user reached the hourly usage limit. It gates new inference and turns until
   * Resume clears it after this time; the sandbox lifecycle, including idle expiry, continues.
   */
  limitedUntil: string | null;
  /** The pending report PrairieLearn rejected, so a rejection reaches Sentry once. */
  rejectedReportId?: string | null;
}

// A provider request that ends without final usage, such as a dropped stream or a Stop, is
// charged its size at about four characters per token plus a generous reply.
const ESTIMATED_CHARACTERS_PER_TOKEN = 4;
const ESTIMATED_OUTPUT_TOKENS = 16_000;

// Requests wait for PrairieLearn only when its last decision is older than this, which in
// practice means once per turn. A limit reached mid-turn takes effect at the next request after
// a report, so spending can overshoot it by up to about USAGE_FLUSH_SECONDS of usage.
const DECISION_TTL_MS = 60_000;
// Unsent usage is reported this long after it is recorded, which also keeps the decision fresh
// while the agent works.
const USAGE_FLUSH_SECONDS = 30;
const MAX_FLUSH_RETRY_SECONDS = 60 * 60;
// Codex makes one provider request at a time; this bounds what a misbehaving sandbox can start
// within one decision.
const MAX_PROVIDER_REQUESTS = 4;

const OPENAI_API = 'https://api.openai.com';

type Admission = 'allowed' | 'limited' | 'unavailable' | 'stopped';

// Web request failures end a Codex turn, so a search that is not admitted returns text instead.
const SEARCH_NOT_ADMITTED: Record<Exclude<Admission, 'allowed'>, string> = {
  limited: 'Web search is unavailable: the hourly usage limit was reached.',
  unavailable: 'Web search is temporarily unavailable. Try again shortly.',
  stopped: 'Web search is unavailable because this task was stopped.',
};
const SEARCH_BUSY = 'Too many requests are running. Wait for them to finish and try again.';

const Count = z.number().int().nonnegative();
const ModelEventSchema = z.looseObject({
  type: z.string(),
  response: z
    .looseObject({
      usage: z
        .looseObject({
          input_tokens: Count,
          output_tokens: Count,
          input_tokens_details: z
            .looseObject({
              cached_tokens: Count.nullish(),
              cache_write_tokens: Count.nullish(),
            })
            .nullish(),
          output_tokens_details: z.looseObject({ reasoning_tokens: Count.nullish() }).nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

function requestUsage(event: z.infer<typeof ModelEventSchema>): Usage | null {
  const usage = event.response?.usage;
  if (!usage) return null;
  return UsageSchema.parse({
    ...emptyUsage(),
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
    cacheWriteInputTokens: usage.input_tokens_details?.cache_write_tokens ?? 0,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
  });
}

function estimateUsage(body: string): Usage {
  return {
    ...emptyUsage(),
    inputTokens: Math.ceil(body.length / ESTIMATED_CHARACTERS_PER_TOKEN),
    outputTokens: ESTIMATED_OUTPUT_TOKENS,
  };
}

const CourseContextSchema = z.object({
  courseTitle: z.string().max(500),
  courseShortName: z.string().max(100),
});

/**
 * A saved expiry for a turn, an idle sandbox, or a blocked sandbox awaiting recovery. The sandbox
 * ID prevents stale alarms from shutting down a replacement sandbox. Turn expiry includes startup.
 */
interface Deadline {
  at: string;
  kind: 'turn' | 'idle' | 'recovery';
  sandboxId: string;
}

/**
 * A review the agent has not yet received the outcome of. PrairieLearn owns the decision and
 * outcome; this record holds the snapshot and the outcome until a turn delivers it.
 */
interface ReviewRecord {
  id: string;
  /** Contents are placeholders; per-file KV entries keep durable values small. */
  snapshot: ReviewSnapshot;
  result: RequestChangesResult | null;
  /**
   * Set when a delivery turn ends without the agent receiving the result (stopped or failed),
   * so only Resume retries it, even across wakes, rather than repeating a failing delivery.
   */
  waitsForResume: boolean;
}

interface RecordData {
  config: CourseSource & { model: string };
  courseContext: z.infer<typeof CourseContextSchema> | null;
  nativeThreadId: string | null;
  checkpoint: DirectoryBackupRecord | null;
  deadline: Deadline | null;
  /** Shown until the next message that does not itself find the sandbox lost. */
  sandboxLost: boolean;
  /**
   * Set when a sandbox starts, which restores the native thread from a checkpoint or starts a new
   * one, and cleared once Codex accepts a turn carrying any history it missed.
   */
  threadMayBeBehind: boolean;
  review: ReviewRecord | null;
  /**
   * A review the instructor denied by sending a message. The next user message's turn delivers
   * the denial with that message, which the browser sends once PrairieLearn records the denial.
   */
  deniedByMessage?: string | null;
  /** The last user message submitted to Codex; absent in records saved before it was added. */
  submittedMessageId?: string | null;
  /** User messages refused by the usage limit, sent to Codex with the next admitted message. */
  unsentMessageIds?: string[];
  /** Absent in records saved before titles were generated. */
  title?: string | null;
}

// Destruction is a private phase because the replacement checkpoint is committed
// before container removal can be attempted.
type ConversationRecord = RecordData &
  (
    | { lifecycle: Extract<ConversationLifecycle, { status: 'offline' }>; sandboxId: null }
    | {
        lifecycle: Exclude<ConversationLifecycle, { status: 'offline' }> | { status: 'destroying' };
        sandboxId: string | null;
      }
  );

interface ActiveTurn {
  /** Authorizes this turn's model requests; requests made outside a turn are refused. */
  executionId: string;
  requestId: string;
  startedAt: number;
  execution: SandboxTurn;
  sdkFinished: PromiseWithResolvers<undefined>;
  /** Resolved when finishTurn releases execution ownership. */
  released: PromiseWithResolvers<undefined>;
  stop: Promise<void> | null;
  shutdown: boolean;
  /** The review whose result this turn delivers, if it is a delivery turn. */
  deliveringReviewId: string | null;
  /** Set once the turn's provider requests are aborted, so no new one starts. */
  finishing: boolean;
}

const reviewFileKey = (reviewId: string, index: number) => `review-file:${reviewId}:${index}`;

/**
 * Owns a conversation's sandbox lifecycle: admit one turn, preserve edits, and recover failures.
 * Chat history and browser reconnect replay belong to AIChatAgent. The private record below
 * persists sandbox configuration and recovery data; browsers receive only its status/deadline.
 */
export class Conversation extends AIChatAgent<Env, ConversationState> {
  override initialState: ConversationState = {
    status: 'offline',
    deadlineAt: null,
    sandboxLost: false,
    reviewId: null,
    title: null,
  };

  private budget: BudgetState = {
    unreported: emptyUsage(),
    pending: null,
    limitedUntil: null,
  };

  /** Shared by concurrent callers so that only one report is in flight. */
  private reporting: Promise<boolean> | null = null;
  /** When PrairieLearn last allowed inference; in memory, so a restarted object checks first. */
  private allowedAt: number | null = null;

  /**
   * The turn's provider requests. Turn completion aborts them, which charges their estimates. They
   * are in memory only: a request running when the object restarts goes unrecorded, which deferred
   * deploys make rare.
   */
  private readonly providerRequests = new Set<AbortController>();

  private _record: ConversationRecord | null = null;
  // Process connections and completion promises exist only in this DO instance.
  private active: ActiveTurn | null = null;
  private native: CodexAppServerClient | null = null;
  private recovering = false;
  /** Shared by every shutdown caller; delivery waits for it to finish. */
  private sandboxShutdown: Promise<void> | null = null;
  private readonly uploadQuota = new UploadQuota(async () => {
    const { objects } = await this.env.CHECKPOINTS.list({ prefix: uploadPrefix(this.name) });
    return { count: objects.length, bytes: objects.reduce((sum, object) => sum + object.size, 0) };
  });

  private reportError(error: unknown) {
    reportError(error, {
      'course_agent.lifecycle': this._record?.lifecycle.status ?? 'uninitialized',
    });
  }

  override onError(...args: [error: unknown] | [connection: Connection, error: unknown]) {
    this.reportError(args.length === 1 ? args[0] : args[1]);
  }

  private get record() {
    if (!this._record) throw new Error('Conversation is not initialized');
    return this._record;
  }

  private get sandbox() {
    if (!this.record.sandboxId) throw new Error('No live sandbox');
    return this.env.CourseSandbox.getByName(this.record.sandboxId);
  }

  /**
   * Browser-visible state is a view of the saved private record, not another source of truth.
   * It omits repository details, native IDs, and archive references. Container destruction is
   * part of "saving" from the user's perspective, so expose it as suspending.
   */
  private get publicState(): ConversationState {
    const lifecycle = this.record.lifecycle;
    const common = {
      sandboxLost: this.record.sandboxLost,
      reviewId: this.record.review?.id ?? null,
      title: this.record.title ?? null,
    };
    // The usage limit is shown once the sandbox is at rest; in-flight states still show progress.
    const retryAt = this.budget.limitedUntil;
    if (retryAt && ['offline', 'waiting_for_user'].includes(lifecycle.status)) {
      return { status: 'blocked', reason: 'usage_limit', retryAt, deadlineAt: null, ...common };
    }
    return {
      ...(lifecycle.status === 'destroying' ? { status: 'suspending' as const } : lifecycle),
      deadlineAt: this.record.deadline?.at ?? null,
      ...common,
    };
  }

  /**
   * Save a complete private record before publishing its public projection. Saving a record that
   * is idle with a result to deliver schedules the delivery, so no release point has to.
   */
  private setRecord(next: ConversationRecord) {
    this.ctx.storage.kv.put('conversation', next);
    this._record = next;
    this.setState(this.publicState);
    void this.scheduleDelivery().catch((error: unknown) => this.reportError(error));
  }

  /**
   * Built-in SDK hook when this Durable Object starts or wakes after idling.
   * getAgentByName() runs this before initialize() for a newly addressed object.
   * Restore saved state and flag operations that lost their in-memory execution handles.
   */
  override async onStart() {
    this._record = this.ctx.storage.kv.get<ConversationRecord>('conversation') ?? null;
    this.budget = this.ctx.storage.kv.get<BudgetState>('budget') ?? this.budget;
    // A new object has no saved conversation yet. Leave the private record null until initialize()
    // creates the record; this hook does not provision a sandbox.
    if (!this._record) return;
    if (this.budget.pending || !isEmptyUsage(this.budget.unreported)) this.scheduleFlush(0);
    this.setState(this.publicState);
    // offline, blocked, and waiting_for_user are stable across wakes: none requires
    // reconstructing an in-flight operation. The remaining states need explicit recovery.
    switch (this.record.lifecycle.status) {
      case 'offline':
        // Offline awaits a message, or delivers a review result that arrived before the restart.
        await this.scheduleDelivery(1);
        return;
      case 'blocked':
        // Blocked awaits Resume, with automatic recovery as a fallback while a sandbox remains.
        if (this.record.sandboxId && !this.record.deadline) this.scheduleRecovery();
        return;
      case 'waiting_for_user':
        // The sandbox is ready for input; restore its idle shutdown using the saved expiry. The
        // delivery is scheduled first, since saving the deadline would otherwise schedule it
        // without the wake delay.
        await this.scheduleDelivery(1);
        await this.scheduleDeadline('idle', this.record.deadline?.at);
        return;
      case 'starting':
        // Setup lost its execution handle. Resume must discard the incomplete container.
        this.block('startup_failed');
        return;
      case 'waiting_for_agent':
      case 'stopping':
        // Native work may still be running. Resume must stop writers and checkpoint their edits.
        this.block('runtime_failed');
        return;
      case 'destroying':
        // The checkpoint is committed. Resume retries destruction without making another backup.
        this.block('cleanup_failed');
        return;
      case 'suspending':
        // Backup was interrupted. Retain the sandbox and previous checkpoint for Resume to retry.
        this.block('checkpoint_failed');
    }
  }

  /**
   * Set up conversation state and pin the course source and model.
   * The sandbox is created or restored when the first message arrives.
   */
  initialize(config: CourseSource) {
    if (this._record) throw new Error('Conversation is already initialized');
    // TODO: Define how existing sandboxes follow course repository/branch changes. Never
    // retarget an edited sandbox just because a reconnect supplies updated course labels.
    this.setRecord({
      lifecycle: { status: 'offline' },
      config: { ...config, model: this.env.OPENAI_MODEL },
      courseContext: null,
      sandboxId: null,
      nativeThreadId: null,
      checkpoint: null,
      review: null,
      deadline: null,
      sandboxLost: false,
      threadMayBeBehind: false,
      submittedMessageId: null,
      title: null,
    });
  }

  /**
   * Built-in SDK hook when a chat WebSocket connects.
   * Accept trusted course context from PL and send the persisted chat history to that connection.
   */
  override async onConnect(connection: Connection, context: ConnectionContext) {
    const courseContext = CourseContextSchema.parse(
      JSON.parse(decodeURIComponent(context.request.headers.get('X-PL-Course-Context') ?? 'null')),
    );
    this.setRecord({ ...this.record, courseContext });
    connection.send(
      JSON.stringify({
        type: MessageType.CF_AGENT_CHAT_MESSAGES,
        messages: await this.sessions.session().getHistory(),
      }),
    );
    // Idempotent: every connection shares one interval schedule.
    await this.scheduleEvery(KEEPALIVE_SECONDS, 'sendKeepalive');
  }

  /** Clients ignore this message type; sending it only keeps proxied sockets from idling out. */
  async sendKeepalive() {
    const connections = [...this.getConnections()];
    if (connections.length === 0) {
      const schedule = await this.scheduleEvery(KEEPALIVE_SECONDS, 'sendKeepalive');
      await this.cancelSchedule(schedule.id);
      return;
    }
    for (const connection of connections) {
      connection.send(JSON.stringify({ type: 'course_agent_keepalive' }));
    }
  }

  override validateStateChange(_state: ConversationState, source: Connection | 'server') {
    if (source !== 'server') throw new Error('Conversation state is managed by PrairieLearn');
  }

  /** SDK restart recovery preserves buffered output but must never repeat file edits. */
  protected override async onChatRecovery() {
    if (this._record && this.record.lifecycle.status !== 'blocked') this.block('runtime_failed');
    return { continue: false };
  }

  private block(reason: Exclude<BlockedReason, 'usage_limit'>) {
    // Callers report the underlying error separately.
    logEvent('conversation_blocked', {
      conversationId: this.name,
      from: this.record.lifecycle.status,
      reason,
    });
    this.setRecord({
      ...this.record,
      lifecycle: { status: 'blocked', reason },
      deadline: null,
    });
    if (this.record.sandboxId) this.scheduleRecovery();
  }

  /**
   * A blocked conversation still holds a container whose unsaved edits are lost once its
   * inactivity timeout ends. Recover on the user's behalf if they have not resumed by then.
   */
  private scheduleRecovery() {
    void this.scheduleDeadline('recovery').catch((error: unknown) => this.reportError(error));
  }

  /**
   * Save a turn or idle deadline for the current sandbox and schedule onDeadline().
   * Use the supplied expiry when restoring an idle deadline; otherwise start the configured budget now.
   */
  private async scheduleDeadline(kind: Deadline['kind'], at?: string) {
    const sandboxId = this.record.sandboxId;
    if (!sandboxId) throw new Error('Deadline requires a live sandbox');
    const seconds = kind === 'turn' ? this.env.AGENT_TURN_SECONDS : this.env.USER_IDLE_SECONDS;
    const deadline: Deadline = {
      at: at ?? new Date(Date.now() + Number(seconds) * 1000).toISOString(),
      kind,
      sandboxId,
    };
    this.setRecord({ ...this.record, deadline });
    // Schedules use whole seconds: round up so the callback cannot fire too early.
    await this.schedule(
      new Date(Math.ceil(Math.max(Date.now(), Date.parse(deadline.at)) / 1000) * 1000),
      'onDeadline',
      deadline,
      { idempotent: true },
    );
  }

  /** Expired turns stop before backup; idle sandboxes can be backed up immediately. */
  async onDeadline(expected: Deadline) {
    const current = this.record.deadline;
    // State changes can replace the deadline or sandbox after a callback was queued.
    if (
      current?.at !== expected.at ||
      current.kind !== expected.kind ||
      current.sandboxId !== expected.sandboxId ||
      Date.parse(expected.at) > Date.now()
    ) {
      return;
    }
    if (expected.kind === 'idle') {
      await this.backupAndShutdown();
    } else if (expected.kind === 'recovery') {
      const recovered = await this.resume({ explicit: false }).catch((error: unknown) => {
        this.reportError(error);
        return false;
      });
      // Resume declines while other work owns the sandbox; check again later.
      if (!recovered && this.record.lifecycle.status === 'blocked' && this.record.sandboxId) {
        this.scheduleRecovery();
      }
    } else {
      await this.stopLive(true);
    }
  }

  /** Start tracking a provider request, or return null if too many are running. */
  private startProviderRequest(estimate: Usage) {
    if (this.providerRequests.size >= MAX_PROVIDER_REQUESTS) return null;
    const abort = new AbortController();
    this.providerRequests.add(abort);
    /** Records the request's usage once; unknown usage is charged the estimate. */
    const finish = (usage: Usage | null) => {
      if (!this.providerRequests.delete(abort)) return;
      if (!usage) logEvent('provider_usage_estimated', { conversationId: this.name });
      this.recordUsage(usage ?? estimate);
    };
    // Nothing reads an aborted request, so its usage will never arrive.
    abort.signal.addEventListener('abort', () => finish(null));
    return { finish, signal: abort.signal };
  }

  private recordUsage(usage: Usage) {
    if (isEmptyUsage(usage)) return;
    this.saveBudget({ ...this.budget, unreported: addUsage(this.budget.unreported, usage) });
    this.scheduleFlush(USAGE_FLUSH_SECONDS);
  }

  /**
   * Unsent usage always has a flush scheduled. Retries get a distinct payload: an idempotent
   * insert from inside a running callback would match that callback's own row, which is deleted
   * when it returns.
   */
  private scheduleFlush(delaySeconds: number, attempt = 0) {
    void this.schedule(delaySeconds, 'flushUsage', attempt ? { attempt } : undefined, {
      idempotent: true,
    }).catch((error: unknown) => this.reportError(error));
  }

  /**
   * Report all unsent usage, including usage recorded while a report was in flight, retrying with
   * backoff while PrairieLearn is unreachable.
   */
  async flushUsage(retry?: { attempt: number }) {
    while (this.budget.pending || !isEmptyUsage(this.budget.unreported)) {
      if (!(await this.reportUsage())) {
        const attempt = (retry?.attempt ?? 0) + 1;
        this.scheduleFlush(
          Math.min(USAGE_FLUSH_SECONDS * 2 ** attempt, MAX_FLUSH_RETRY_SECONDS),
          attempt,
        );
        return;
      }
    }
  }

  /** Ask PrairieLearn for a decision unless the current one is still known. */
  private checkUsageLimit(): Promise<boolean> | true {
    const fresh = this.allowedAt !== null && Date.now() - this.allowedAt < DECISION_TTL_MS;
    return this.budget.limitedUntil || fresh ? true : this.reportUsage();
  }

  private saveBudget(next: BudgetState) {
    const limitChanged = next.limitedUntil !== this.budget.limitedUntil;
    this.ctx.storage.kv.put('budget', next);
    this.budget = next;
    if (limitChanged && this._record) this.setState(this.publicState);
  }

  /**
   * Send usage since the last report and save PrairieLearn's decision for the next model request.
   * Returns false if PrairieLearn could not be reached or refused the report; the same report is
   * resent next time.
   */
  private reportUsage(): Promise<boolean> {
    this.reporting ??= this.sendUsageReport().finally(() => {
      this.reporting = null;
    });
    return this.reporting;
  }

  private async sendUsageReport() {
    let report = this.budget.pending;
    if (!report) {
      report = {
        reportId: crypto.randomUUID(),
        model: this.record.config.model,
        usage: this.budget.unreported,
      };
      this.saveBudget({ ...this.budget, pending: report, unreported: emptyUsage() });
    }
    let response: Response;
    try {
      const url = new URL(
        `pl/api/course-agent/conversations/${this.name}/usage`,
        this.env.PL_SERVICE_URL.endsWith('/')
          ? this.env.PL_SERVICE_URL
          : `${this.env.PL_SERVICE_URL}/`,
      );
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.env.PL_SERVICE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(report),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      logEvent('usage_report_unavailable', { conversationId: this.name, error: String(error) });
      return false;
    }
    if (response.status >= 500) {
      logEvent('usage_report_unavailable', { conversationId: this.name, status: response.status });
      return false;
    }
    const decision = response.ok
      ? UsageDecisionSchema.safeParse(await response.json().catch(() => null))
      : null;
    if (!decision?.success) {
      // A rejected report is a configuration or deployment fault, such as a rotated token, an
      // unpriced model or a PrairieLearn without this route. Keep the report pending so the
      // conversation recovers once it is fixed.
      if (this.budget.rejectedReportId !== report.reportId) {
        this.saveBudget({ ...this.budget, rejectedReportId: report.reportId });
        this.reportError(new Error(`Usage report was rejected with ${response.status}`));
      }
      logEvent('usage_report_rejected', { conversationId: this.name, status: response.status });
      return false;
    }
    // Only Resume clears the limit, so an allowed decision leaves an existing one in place. A
    // decision answered after its hour ended no longer applies.
    const { data } = decision;
    this.saveBudget({
      ...this.budget,
      pending: null,
      limitedUntil:
        data.status === 'limited' && Date.parse(data.retryAt) > Date.now()
          ? data.retryAt
          : this.budget.limitedUntil,
    });
    this.allowedAt = decision.data.status === 'allowed' ? Date.now() : null;
    return true;
  }

  /**
   * Admit a model or search request from the current turn, asking PrairieLearn first when its
   * last decision is stale.
   */
  private async admit(executionId: string): Promise<Admission> {
    const reached = await this.checkUsageLimit();
    if (this.budget.limitedUntil) {
      this.interruptForUsageLimit();
      return 'limited';
    }
    if (!reached) return 'unavailable';
    if (
      this.active?.executionId !== executionId ||
      this.active.finishing ||
      this.record.lifecycle.status === 'stopping' ||
      this.sandboxShutdown
    ) {
      return 'stopped';
    }
    return 'allowed';
  }

  private forwardModelResponse(
    response: Response,
    { finish, signal }: { finish: (usage: Usage | null) => void; signal: AbortSignal },
  ): Response {
    if (!response.ok) {
      // The provider does not bill a request it rejected or failed to serve.
      finish(emptyUsage());
      return response;
    }
    if (!response.body) throw new Error('Provider returned no response body');
    // The caller gets the provider's bytes unchanged; a copy is read for the final usage.
    const [forwarded, metered] = response.body.tee();
    const streamed = response.headers.get('Content-Type')?.includes('text/event-stream');
    void this.keepAliveWhile(async () => {
      try {
        if (!streamed) {
          const event = ModelEventSchema.parse({
            type: 'response.completed',
            response: await new Response(metered).json(),
          });
          finish(requestUsage(event));
          return;
        }
        const reader = parseJsonEventStream({
          stream: metered,
          schema: ModelEventSchema,
        }).getReader();
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (
            chunk.value.success &&
            ['response.completed', 'response.incomplete', 'response.failed'].includes(
              chunk.value.value.type,
            )
          ) {
            // A failed response that reports no usage was not billed.
            const usage =
              requestUsage(chunk.value.value) ??
              (chunk.value.value.type === 'response.failed' ? emptyUsage() : null);
            if (usage) finish(usage);
          }
        }
      } finally {
        // Charges the estimate unless the usage was recorded above.
        finish(null);
      }
    }).catch((error: unknown) => {
      // Turn completion aborts requests nothing reads anymore; that is not a failure.
      if (!signal.aborted) this.reportError(error);
    });
    const headers = new Headers(response.headers);
    // fetch() decoded the body, so the provider's length and encoding no longer apply.
    headers.delete('Content-Length');
    headers.delete('Content-Encoding');
    return new Response(forwarded, { headers, status: response.status });
  }

  private interruptForUsageLimit() {
    const active = this.active;
    if (!active) return;
    // Let the provider-facing error return before interrupting its waiting native caller.
    void this.keepAliveWhile(async () => {
      await scheduler.wait(0);
      if (this.active === active) await this.stopLive();
    }).catch((error: unknown) => this.reportError(error));
  }

  private openai(path: string, body: string, signal?: AbortSignal) {
    return fetch(`${OPENAI_API}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body,
      redirect: 'manual',
      signal,
    });
  }

  /** The sandbox's model outbound binding calls this; only the current turn may use the model. */
  async proxyModelRequest(body: string, executionId: string): Promise<Response> {
    if (this.active?.executionId !== executionId) {
      return new Response('Forbidden', { status: 403 });
    }
    const admission = await this.admit(executionId);
    const request = admission === 'allowed' ? this.startProviderRequest(estimateUsage(body)) : null;
    if (!request) {
      if (admission === 'limited') {
        return Response.json(
          {
            error: {
              code: 'course_agent_usage_limit',
              message: 'The hourly AI usage limit was reached.',
            },
          },
          { status: 429 },
        );
      }
      if (admission === 'unavailable') {
        // Codex retries server errors, and its retry resends the pending report.
        return new Response('Usage could not be recorded', { status: 503 });
      }
      if (admission === 'stopped') return new Response('Execution stopped', { status: 409 });
      return new Response('Too many model requests are running', { status: 429 });
    }
    try {
      const response = await this.openai('/v1/responses', body, request.signal);
      return this.forwardModelResponse(response, request);
    } catch (error) {
      // An aborted request was charged its estimate; one that failed to connect was not billed.
      request.finish(emptyUsage());
      if (request.signal.aborted) return new Response('Execution stopped', { status: 409 });
      throw error;
    }
  }

  /**
   * The sandbox's model outbound binding calls this for a validated web request. Each command is
   * charged as one web search call, since the provider reports no usage for them.
   */
  async proxySearchRequest(
    body: string,
    operations: number,
    executionId: string,
  ): Promise<Response> {
    if (this.active?.executionId !== executionId) {
      return new Response('Forbidden', { status: 403 });
    }
    const admission = await this.admit(executionId);
    const usage = { ...emptyUsage(), webSearchCalls: operations };
    const request = admission === 'allowed' ? this.startProviderRequest(usage) : null;
    if (!request) {
      return Response.json({
        output: admission === 'allowed' ? SEARCH_BUSY : SEARCH_NOT_ADMITTED[admission],
      });
    }
    try {
      const response = await this.openai('/v1/alpha/search', body, request.signal);
      request.finish(response.ok ? usage : emptyUsage());
      return response;
    } catch (error) {
      request.finish(emptyUsage());
      if (request.signal.aborted) return Response.json({ output: SEARCH_NOT_ADMITTED.stopped });
      throw error;
    }
  }

  /** Stop retains admission until both sandbox cleanup and SDK completion finish. */
  private async stopLive(shutdown = false) {
    const active = this.active;
    if (!active) {
      this.block('runtime_failed');
      return;
    }
    active.shutdown ||= shutdown;
    this.setRecord({ ...this.record, lifecycle: { status: 'stopping' }, deadline: null });
    active.stop ??= active.execution.stop();
    await active.stop;
  }

  /**
   * SDK inbound-message hook: admit one input and return its sandbox output stream. An SDK
   * continuation delivers the saved review result; a user message is submitted as written.
   */
  override async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    if (!options) throw new Error('Missing SDK chat options');
    const continuation = options.continuation === true;
    // Capture input before any await lets another connection append to history.
    const message = continuation
      ? null
      : nextUserMessage(this.messages, this.record.submittedMessageId ?? null);
    const unsentIds = this.record.unsentMessageIds ?? [];
    const unsent = this.messages.filter(({ id }) => unsentIds.includes(id));
    const earlier = historyBefore(this.messages, message).filter(
      ({ id }) => !unsentIds.includes(id),
    );
    // Messages refused by the usage limit are sent with this one.
    const sent = message ? [...unsent, message] : [];
    const attachments = sent.flatMap(attachmentsOf);
    const checkedSandboxId = this.record.sandboxId;
    const [running, images] = await Promise.all([
      checkedSandboxId === null || this.env.CourseSandbox.getByName(checkedSandboxId).isRunning(),
      this.findImages(attachments),
      // Check the usage limit before a message boots a sandbox or generates a title. The first
      // model request then finds the decision fresh. If PrairieLearn is unreachable, that request
      // reports the failure instead. Continuations are checked before they are scheduled, and
      // one that races a new limit is stopped by its first model request.
      continuation || this.checkUsageLimit(),
    ]);
    const lost = !running;
    const review = this.record.review;
    const status = this.record.lifecycle.status;
    // Read with `review`: a denial recorded during the await settles the review it admits by.
    const deniedReviewId = continuation ? null : (this.record.deniedByMessage ?? null);
    // deliverWaitingResult() claims the conversation before the SDK calls back for a continuation.
    const admitted = continuation
      ? review?.result && status === 'waiting_for_agent'
      : !review && (status === 'offline' || status === 'waiting_for_user');
    const refuse = (reason: string) => {
      // The SDK has already saved the message. Count it as handled, or the next submit would
      // send this refused prompt in place of the user's next one.
      if (message) this.setRecord({ ...this.record, submittedMessageId: message.id });
      return new Error(reason);
    };
    if (!admitted || this.active || this.recovering || this.sandboxShutdown) {
      throw refuse('The course agent sandbox is not ready.');
    }
    if (message && this.budget.limitedUntil) {
      this.setRecord({
        ...this.record,
        submittedMessageId: message.id,
        unsentMessageIds: [...unsentIds, message.id],
      });
      // The usage limit notice explains the refusal; an empty reply adds nothing to history.
      return createUIMessageStreamResponse({
        stream: new ReadableStream({ start: (c) => c.close() }),
      });
    }
    if (!images) {
      // A refused message's expired attachment would refuse every later message too.
      this.setRecord({ ...this.record, unsentMessageIds: [] });
      throw refuse('An attached file is no longer available. Attach it again.');
    }
    if (!continuation && !message) throw new Error('Expected a new user message');
    const abandoned = lost && this.record.sandboxId === checkedSandboxId;
    if (abandoned) this.abandonLostSandbox();
    if (message && earlier.length === 0 && !this.record.title) {
      this.startTitle(unsent[0] ?? message);
    }
    const startup = this.record.sandboxId === null;
    const source = this.record.config;
    const delivered = continuation && review?.result ? review : null;
    const location =
      message && UserMessageMetadataSchema.safeParse(message.metadata ?? {}).data?.location;
    // File parts are left out rather than joined as blank lines.
    const messageText = sent
      .map((entry) =>
        entry.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n'),
      )
      .join('\n\n');
    const input: TurnInput = {
      ...(delivered?.result
        ? {
            tag: reviewTag(delivered.id),
            once: true,
            text: describeReviewResult(delivered.result, source.type),
          }
        : {
            tag: messageTag(message!.id),
            text: formatRequest(
              deniedReviewId ? describeDenialMessage(messageText) : messageText,
              attachments,
              images,
            ),
            images: attachments.filter(({ id }) => images.has(id)).map(attachmentPath),
            ...(location ? { page: describePageLocation(location) } : {}),
          }),
      // A restored or new thread may lack turns that chat history has.
      ...((startup || this.record.threadMayBeBehind) && earlier.length > 0
        ? { catchUp: (latestTag) => buildCatchUp(missedTurns(earlier, latestTag), source.type) }
        : {}),
    };
    const startedAt = Date.now();
    const log = (event: string, fields: Record<string, unknown> = {}) =>
      logEvent(event, {
        conversationId: this.name,
        sandboxId: this.record.sandboxId,
        elapsedMs: Date.now() - startedAt,
        ...fields,
      });
    this.setRecord({
      ...this.record,
      // A user message acknowledges an earlier loss unless this message found it.
      sandboxLost: abandoned || (continuation && this.record.sandboxLost),
      sandboxId: startup ? crypto.randomUUID() : this.record.sandboxId,
      lifecycle: { status: startup ? 'starting' : 'waiting_for_agent' },
      threadMayBeBehind: startup || this.record.threadMayBeBehind,
      // Prompts are never resubmitted, even if this turn fails before Codex accepts it.
      submittedMessageId: message?.id ?? this.record.submittedMessageId ?? null,
      unsentMessageIds: [],
    });
    log('turn_started', { startup });
    const native = (this.native ??= new CodexAppServerClient(this.sandbox));
    let nativeThreadId = this.record.nativeThreadId;
    const executionId = crypto.randomUUID();
    const execution = new SandboxTurn(this.sandbox, native, {
      // A continuation is appended to the last assistant message; the SDK ignores this ID then.
      messageId: crypto.randomUUID(),
      input,
      startup,
      onReview: () => this.captureReview(source),
      prepare: async () => {
        await this.scheduleDeadline('turn');
        if (startup) {
          log('turn_sandbox_prepare_requested');
          const started = await this.sandbox.prepare(this.record.config, this.record.checkpoint);
          log('turn_sandbox_prepare_finished', started);
        }
        await this.sandbox.authorizeModel({
          model: this.record.config.model,
          conversationId: this.name,
          executionId,
        });
        const toWrite = [...attachmentsToWrite(earlier, null, startup), ...attachments];
        if (toWrite.length > 0) await this.sandbox.writeAttachments(this.name, toWrite);
        if (delivered) await this.advanceLocalBaseline(delivered);
      },
      addCourseFiles:
        startup && !this.record.checkpoint
          ? async () => {
              log('turn_course_files_started');
              await this.sandbox.addCourseFiles(this.record.config);
              log('turn_course_files_ready');
            }
          : undefined,
      thread: {
        model: this.record.config.model,
        instructions: buildInstructions(this.record.courseContext ?? undefined, source.type),
        threadId: this.record.nativeThreadId,
      },
      // Codex saves a new thread only with its first accepted input, so saving the ID earlier
      // would leave a thread that can never be resumed if submission fails.
      onThread: (id) => {
        nativeThreadId = id;
      },
      onReady: () => this.setRecord({ ...this.record, lifecycle: { status: 'waiting_for_agent' } }),
      onAccepted: (nativeTurnId) => {
        // The agent now has the denial, so a later message must not deliver it again.
        if (deniedReviewId) native.emit(denialMarker(deniedReviewId));
        this.setRecord({
          ...this.record,
          nativeThreadId,
          threadMayBeBehind: false,
          deniedByMessage: deniedReviewId ? null : this.record.deniedByMessage,
        });
        if (nativeTurnId) this.stash({ nativeTurnId });
        if (delivered?.result) {
          // The agent now has the result: mark the delivery in chat history, so an attempt that
          // fails first leaves no marker, and drop the snapshot so new messages are admitted.
          native.emit(turnMarker(input.tag, summarizeReview(delivered.result)));
          this.settleReview(delivered.id);
        }
      },
      log,
    });
    const active: ActiveTurn = {
      executionId,
      requestId: options.requestId,
      startedAt,
      execution,
      sdkFinished: Promise.withResolvers<undefined>(),
      released: Promise.withResolvers<undefined>(),
      stop: null,
      shutdown: false,
      deliveringReviewId: delivered?.id ?? null,
      finishing: false,
    };
    this.active = active;
    const abort = () => {
      void this.stopLive().catch((error: unknown) => {
        this.reportError(error);
        this.block('runtime_failed');
      });
    };
    options.abortSignal?.addEventListener('abort', abort, { once: true });
    if (options.abortSignal?.aborted) abort();
    // SDK Stop can finish its response before the container stops. Keep cleanup alive.
    void this.keepAliveWhile(() => this.finishTurn(active))
      .catch((error: unknown) => {
        this.reportError(error);
        if (
          this.record.lifecycle.status !== 'blocked' &&
          this.record.lifecycle.status !== 'offline'
        ) {
          this.block('runtime_failed');
        }
      })
      .finally(() => options.abortSignal?.removeEventListener('abort', abort));
    return createUIMessageStreamResponse({ stream: execution.stream });
  }

  /** Runs alongside sandbox startup, so the title adds no latency to the first turn. */
  private startTitle(message: UIMessage) {
    const text = message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('\n');
    if (!text.trim()) return;
    void this.keepAliveWhile(async () => {
      const title = await generateTitle({
        apiKey: this.env.OPENAI_API_KEY,
        model: this.record.config.model,
        message: text,
      });
      if (title) this.setRecord({ ...this.record, title });
    }).catch((error: unknown) => this.reportError(error));
  }

  /** Which attachments are images, or null if any upload is missing. */
  private async findImages(attachments: Attachment[]) {
    const uploads = await Promise.all(
      attachments.map(({ id }) =>
        this.env.CHECKPOINTS.get(uploadKey(this.name, id), {
          range: new Headers({ range: `bytes=0-${IMAGE_SIGNATURE_BYTES - 1}` }),
        }),
      ),
    );
    const images = new Set<string>();
    for (const [index, upload] of uploads.entries()) {
      if (!upload) return null;
      if (isImage(new Uint8Array(await upload.arrayBuffer()))) images.add(attachments[index].id);
    }
    return images;
  }

  /** SDK persistence hook, which also runs on messages the browser sends. */
  protected override sanitizeMessageForPersistence(message: UIMessage) {
    return keepUploadReferences(message);
  }

  /** SDK completion hook: release the SDK half of the active operation. */
  protected override async onChatResponse(result: ChatResponseResult) {
    if (this.active?.requestId === result.requestId) this.active.sdkFinished.resolve(undefined);
  }

  /** The single completion path chooses waiting, startup cleanup, or deadline shutdown. */
  private async finishTurn(active: ActiveTurn) {
    const result = await active.execution.finished;
    logEvent('turn_finished', {
      conversationId: this.name,
      phase: result.phase,
      stopped: result.stopped,
      failed: result.error !== undefined,
      elapsedMs: Date.now() - active.startedAt,
    });
    if (result.stopped || result.error) this.native = null;
    // A delivery turn that ended before the agent received its result waits for Resume.
    const review = this.record.review;
    if (review && review.id === active.deliveringReviewId) {
      this.setRecord({ ...this.record, review: { ...review, waitsForResume: true } });
    }
    if (result.error) {
      this.reportError(result.error);
      this.block(result.phase === 'startup' ? 'startup_failed' : 'runtime_failed');
    }
    await active.sdkFinished.promise;
    // Nothing reads a provider request that is still running after Stop, so abort it rather than
    // pay for the rest of its output; it is charged its estimate.
    active.finishing = true;
    for (const abort of this.providerRequests) abort.abort();
    // Report the turn's remaining usage now, so Stats and the hourly limit include it. This also
    // runs when limited: a request can finish after the decision that limited the turn.
    void this.keepAliveWhile(() => this.flushUsage()).catch((error: unknown) =>
      this.reportError(error),
    );
    if (this.active !== active) return;
    try {
      await active.stop;
    } finally {
      this.active = null;
      active.released.resolve(undefined);
      if (active.stop) this.native = null;
    }
    if (this.record.lifecycle.status === 'blocked') return;
    if (result.stopped && result.phase === 'startup') {
      await this.discardStartup();
    } else if (active.shutdown) {
      await this.backupAndShutdown();
    } else {
      this.setRecord({ ...this.record, lifecycle: { status: 'waiting_for_user' } });
      await this.scheduleDeadline('idle');
    }
  }

  /** RPC: reserve room for an upload under this conversation's cap, or refuse it. */
  async reserveUpload(size: number) {
    return await this.uploadQuota.reserve(size);
  }

  /** RPC: return the room reserved for an upload that was not stored. */
  async releaseUpload(size: number) {
    await this.uploadQuota.release(size);
  }

  /**
   * Resume repairs a blocked sandbox, clears an expired usage limit, then delivers a waiting review
   * result, even one that waits for Resume. It never repeats an interrupted prompt. Automatic
   * recovery passes explicit: false so it only repairs; a result that does not wait for Resume is
   * still delivered afterwards.
   */
  async resume({ explicit = true }: { explicit?: boolean } = {}): Promise<boolean> {
    // A waiting result is delivered when the current turn ends, or is being delivered now (for
    // example, started by PrairieLearn's resend just before Resume), so there is nothing to repair.
    if (this.record.review?.result && this.record.lifecycle.status === 'waiting_for_agent') {
      return true;
    }
    // Another Resume, shutdown, or unfinished turn must not modify this sandbox concurrently.
    if (this.active || this.recovering || this.sandboxShutdown) return false;
    const lifecycle = this.record.lifecycle;
    if (lifecycle.status === 'blocked') {
      this.recovering = true;
      try {
        switch (lifecycle.reason) {
          case 'startup_failed':
            await this.discardStartup();
            break;
          case 'runtime_failed':
          case 'checkpoint_failed':
            await this.backupAndShutdown();
            break;
          case 'cleanup_failed':
            await this.destroyCheckpointed();
        }
      } finally {
        this.recovering = false;
      }
    } else if (!this.record.review?.result && !this.budget.limitedUntil) {
      return false;
    }
    const limitedUntil = this.budget.limitedUntil;
    // Automatic recovery leaves the limit for the user to clear.
    if (limitedUntil && explicit) {
      // A repaired sandbox counts as resumed even though the limit still applies.
      if (Date.parse(limitedUntil) > Date.now()) return lifecycle.status === 'blocked';
      // The next model request asks PrairieLearn again, so a limit that still applies returns.
      this.saveBudget({ ...this.budget, limitedUntil: null });
    }
    // Saving the record schedules the delivery, now that the usage limit allows it.
    const review = this.record.review;
    if (explicit && review?.result) {
      this.setRecord({ ...this.record, review: { ...review, waitsForResume: false } });
    }
    return true;
  }

  /** Discard interrupted setup while retaining the last committed checkpoint. */
  private async discardStartup() {
    try {
      if (this.record.sandboxId && (await this.sandbox.isRunning())) await this.sandbox.destroy();
      this.setRecord({
        ...this.record,
        sandboxId: null,
        deadline: null,
        nativeThreadId: this.record.checkpoint ? this.record.nativeThreadId : null,
        lifecycle: { status: 'offline' },
      });
    } catch (error) {
      this.block('startup_failed');
      throw error;
    }
  }

  /**
   * A stopped container has already lost its edits since the last checkpoint, so backing it up
   * can never succeed. Drop it; the next turn restores the checkpoint (or the course source).
   */
  private abandonLostSandbox() {
    this.native?.close();
    this.native = null;
    this.setRecord({
      ...this.record,
      sandboxId: null,
      deadline: null,
      // The native thread lives in the sandbox, so it survives only through a checkpoint.
      nativeThreadId: this.record.checkpoint ? this.record.nativeThreadId : null,
      sandboxLost: true,
      lifecycle: { status: 'offline' },
    });
  }

  /**
   * Save a snapshot of the agent's edits as a new review. The tool call returns immediately, and
   * the result arrives in a later turn, so no native request waits on an instructor.
   */
  private async captureReview(source: CourseSource) {
    if (this.record.review) {
      return {
        success: false,
        text: 'Earlier changes are still waiting for the instructor. Their decision arrives in a later message; submit again after that.',
      };
    }
    const turn = this.active;
    let snapshot: ReviewSnapshot;
    try {
      const capture = await this.sandbox.captureReview(source);
      if ('unsupported' in capture) {
        return { success: false, text: `Could not submit the review: ${capture.unsupported}` };
      }
      snapshot = capture;
    } catch (error) {
      this.reportError(error);
      return {
        success: false,
        text: `Could not submit the review: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    // Parallel calls can each pass the first check while capturing.
    if (this.record.review) {
      return { success: false, text: 'Another submission is already waiting for the instructor.' };
    }
    // A turn that stopped or failed during capture can no longer show the review, so it must not
    // record one. Recording and showing it below happen without an intervening await.
    if (!turn || this.active !== turn || turn.stop || !this.native?.streaming) {
      return { success: false, text: 'The turn ended before the changes were submitted.' };
    }
    if (snapshot.additions.length === 0 && snapshot.deletions.length === 0) {
      return { success: false, text: 'There are no course changes to review.' };
    }
    const id = crypto.randomUUID();
    snapshot.additions.forEach((file, index) =>
      this.ctx.storage.kv.put(reviewFileKey(id, index), file.contents),
    );
    this.setRecord({
      ...this.record,
      review: {
        id,
        snapshot: {
          ...snapshot,
          additions: snapshot.additions.map(({ path }) => ({ path, contents: '' })),
        },
        result: null,
        waitsForResume: false,
      },
    });
    // Chat history shows the review by ID; its contents and outcome stay out of history.
    this.native?.emit({ type: 'data-review', id, data: { reviewId: id } });
    return {
      success: true,
      text: 'Submitted the changes for instructor review; edits after this point are not part of it. The decision arrives in a later message. If you have not yet described the changes for staff, do so briefly now. Then end your turn without making further edits.',
    };
  }

  private reviewFiles(review: ReviewRecord) {
    return review.snapshot.additions.map((file, index) => ({
      path: file.path,
      contents: this.ctx.storage.kv.get<string>(reviewFileKey(review.id, index))!,
    }));
  }

  /** The agent has received the result: drop the snapshot so new messages are admitted. */
  private settleReview(reviewId: string) {
    const review = this.record.review;
    if (review?.id !== reviewId) return;
    review.snapshot.additions.forEach((_, index) =>
      this.ctx.storage.kv.delete(reviewFileKey(review.id, index)),
    );
    this.setRecord({ ...this.record, review: null });
  }

  /** Before the agent continues, make saved local files the next review's baseline. */
  private async advanceLocalBaseline(review: ReviewRecord) {
    if (review.result?.publication.status !== 'saved_locally') return;
    await this.sandbox.advanceLocalBaseline([
      ...this.reviewFiles(review),
      ...review.snapshot.deletions.map((file) => ({ path: file.path, contents: null })),
    ]);
  }

  /** The review remains available without restoring or waking a sandbox. */
  getReview(reviewId: string): Review | null {
    const review = this.record.review;
    if (review?.id !== reviewId) return null;
    return { id: review.id, snapshot: { ...review.snapshot, additions: this.reviewFiles(review) } };
  }

  /**
   * Save PrairieLearn's result and deliver it when the sandbox is free. A result for a review the
   * agent already received is acknowledged again; a different result for this review is refused.
   */
  recordReviewResult(reviewId: string, result: RequestChangesResult): boolean {
    const review = this.record.review;
    if (review?.id !== reviewId) return true;
    if (review.result) {
      // Parsing orders keys by schema, so equal results serialize equally.
      return (
        JSON.stringify(RequestChangesResultSchema.parse(review.result)) ===
        JSON.stringify(RequestChangesResultSchema.parse(result))
      );
    }
    if (result.viaMessage) {
      // The browser sends the message next; its turn delivers the denial instead of a turn here.
      this.settleReview(reviewId);
      this.setRecord({ ...this.record, deniedByMessage: reviewId });
      return true;
    }
    this.setRecord({ ...this.record, review: { ...review, result } });
    return true;
  }

  /**
   * Deliver a waiting result if the sandbox is free. The delivery turn is tagged with the review
   * ID, so a retry after a lost acknowledgment does not submit it twice.
   */
  async deliverWaitingResult() {
    const review = this.record.review;
    const status = this.record.lifecycle.status;
    if (!review?.result || this.active || this.recovering || this.sandboxShutdown) return;
    if (status !== 'offline' && status !== 'waiting_for_user') return;
    // Resume delivers the result once it clears the usage limit.
    if (this.budget.limitedUntil) return;
    if (review.waitsForResume) return;
    this.setRecord({
      ...this.record,
      review: { ...review, waitsForResume: false },
      lifecycle: { status: 'waiting_for_agent' },
      deadline: null,
    });
    void this.keepAliveWhile(async () => {
      const outcome = await this.continueLastTurn();
      if (outcome.status !== 'completed' && outcome.status !== 'aborted') {
        throw new Error(`Review result delivery was ${outcome.status}`);
      }
    }).catch((error: unknown) => {
      this.reportError(error);
      const current = this.record.review;
      if (current?.id === review.id) {
        this.setRecord({ ...this.record, review: { ...current, waitsForResume: true } });
      }
      if (this.record.lifecycle.status !== 'blocked' && !this.active) this.block('runtime_failed');
    });
  }

  /**
   * Delivery runs as a scheduled callback rather than inline, so it starts only after whatever
   * released the sandbox has finished and, on wake, after the SDK's own restart recovery has run,
   * which the one-second delay leaves room for.
   */
  private async scheduleDelivery(delaySeconds = 0) {
    const status = this.record.lifecycle.status;
    if (!this.record.review?.result || (status !== 'offline' && status !== 'waiting_for_user')) {
      return;
    }
    await this.schedule(delaySeconds, 'deliverWaitingResult', undefined, { idempotent: true });
  }

  /** Commit a replacement backup before shutdown; cleanup of the old archive is independent. */
  private async backupAndShutdown() {
    // Outcome delivery must await the same shutdown started by idle expiry or recovery.
    if (this.sandboxShutdown) return this.sandboxShutdown;
    const shutdown = this.checkpointAndDestroy();
    this.sandboxShutdown = shutdown;
    try {
      await shutdown;
    } finally {
      this.sandboxShutdown = null;
    }
  }

  private async checkpointAndDestroy() {
    this.setRecord({ ...this.record, lifecycle: { status: 'suspending' }, deadline: null });
    try {
      const active = this.active;
      if (active) {
        await active.execution.stop();
        await active.sdkFinished.promise;
        await active.execution.finished;
        // finishTurn releases execution ownership before checkpointing can proceed.
        if (this.active === active) await active.released.promise;
      }
      this.native?.close();
      this.native = null;
      if (!this.record.sandboxId) {
        this.setRecord({ ...this.record, sandboxId: null, lifecycle: { status: 'offline' } });
        return;
      }
      if (!(await this.sandbox.isRunning())) {
        this.abandonLostSandbox();
        return;
      }
      const previous = this.record.checkpoint;
      const checkpoint = await this.sandbox.checkpoint();
      this.setRecord({ ...this.record, checkpoint, lifecycle: { status: 'destroying' } });
      // The checkpoint retains the local baseline ref, so the source archive is no longer needed.
      if (!previous && this.record.config.type === 'local') {
        await this.schedule(0, 'deleteLocalSource', this.record.config.archiveKey, {
          retry: { maxAttempts: 3 },
        }).catch((error: unknown) => this.reportError(error));
      }
      await this.destroyCheckpointed();
      if (previous) {
        await this.schedule(0, 'deleteCheckpoint', previous, { retry: { maxAttempts: 3 } }).catch(
          (error: unknown) => this.reportError(error),
        );
      }
    } catch (error) {
      if (
        this.record.lifecycle.status !== 'blocked' &&
        this.record.lifecycle.status !== 'offline'
      ) {
        this.block('checkpoint_failed');
      }
      throw error;
    }
  }

  /** Scheduled archive cleanup can retry without holding up the conversation. */
  async deleteCheckpoint(checkpoint: DirectoryBackupRecord) {
    await this.env.CourseSandbox.getByName('archive-cleanup').deleteCheckpoint(checkpoint);
  }

  async deleteLocalSource(archiveKey: string) {
    await this.env.CHECKPOINTS.delete(archiveKey);
  }

  /** A committed backup is required before discarding a sandbox containing edits. */
  private async destroyCheckpointed() {
    if (!this.record.checkpoint) throw new Error('No checkpoint-backed sandbox to destroy');
    try {
      if (this.record.sandboxId && (await this.sandbox.isRunning())) await this.sandbox.destroy();
      this.setRecord({ ...this.record, sandboxId: null, lifecycle: { status: 'offline' } });
    } catch (error) {
      this.block('cleanup_failed');
      throw error;
    }
  }
}
