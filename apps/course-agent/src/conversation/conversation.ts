import {
  AIChatAgent,
  type ChatResponseResult,
  type OnChatMessageOptions,
} from '@cloudflare/ai-chat';
import { MessageType } from '@cloudflare/ai-chat/types';
import type { DirectoryBackupRecord } from '@cloudflare/sandbox';
import type { Connection, ConnectionContext } from 'agents';
import { createUIMessageStreamResponse, isToolUIPart } from 'ai';
import { z } from 'zod';

import {
  type BlockedReason,
  type ConversationLifecycle,
  type ConversationState,
  type PendingReview,
  type RequestChangesResult,
  RequestChangesResultSchema,
  type ReviewDecision,
  type ReviewOutcome,
  type ReviewSnapshot,
  SavedJobOutcomeSchema,
} from '@prairielearn/course-agent-types';

import { reportError } from '../monitoring.js';
import { CodexAppServerClient } from '../sandbox/codex.js';
import type { CourseSource } from '../sandbox/sandbox.js';
import { SandboxTurn } from '../sandbox/turn.js';

import { buildInstructions } from './instructions.js';

const CourseContextSchema = z.object({
  courseTitle: z.string().max(500),
  courseShortName: z.string().max(100),
});

/**
 * A saved expiry for a turn or idle sandbox. The sandbox ID prevents stale alarms
 * from shutting down a replacement sandbox. Turn expiry includes startup time.
 */
interface Deadline {
  at: string;
  kind: 'turn' | 'idle';
  sandboxId: string;
}

interface RecordData {
  config: CourseSource & { model: string };
  courseContext: z.infer<typeof CourseContextSchema> | null;
  nativeThreadId: string | null;
  checkpoint: DirectoryBackupRecord | null;
  deadline: Deadline | null;
  /** Shown until the next message that does not itself find the sandbox lost. */
  sandboxLost: boolean;
  review:
    | (Omit<PendingReview, 'snapshot'> & {
        /** Contents are placeholders; per-file KV entries keep durable values small. */
        snapshot: ReviewSnapshot;
        decision: ReviewDecision | null;
      })
    | null;
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
  requestId: string;
  execution: SandboxTurn;
  sdkFinished: PromiseWithResolvers<undefined>;
  /** Resolved when finishTurn releases execution ownership. */
  released: PromiseWithResolvers<undefined>;
  stop: Promise<void> | null;
  shutdown: boolean;
}
interface ReviewOperation {
  callId: string;
  /** Present while the original native tool call is still waiting for its answer. */
  resolveNativeCall: ((result: RequestChangesResult) => void) | null;
  /** Once PL supplies a result, duplicate callbacks share its persistence and continuation promise. */
  delivery: { result: RequestChangesResult; done: Promise<boolean> } | null;
}

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
  };

  private _record: ConversationRecord | null = null;
  // Process connections and completion promises exist only in this DO instance.
  private active: ActiveTurn | null = null;
  private native: CodexAppServerClient | null = null;
  private recovering = false;
  private reviewOperation: ReviewOperation | null = null;
  /** Continuations wait for the current checkpoint/destruction before starting execution. */
  private sandboxShutdown: Promise<void> | null = null;

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
    return {
      ...(lifecycle.status === 'destroying' ? { status: 'suspending' as const } : lifecycle),
      deadlineAt: this.record.deadline?.at ?? null,
      sandboxLost: this.record.sandboxLost,
    };
  }

  /** Save a complete private record before publishing its public projection. */
  private setRecord(next: ConversationRecord) {
    this.ctx.storage.kv.put('conversation', next);
    this._record = next;
    this.setState(this.publicState);
  }

  /**
   * Built-in SDK hook when this Durable Object starts or wakes after idling.
   * getAgentByName() runs this before initialize() for a newly addressed object.
   * Restore saved state and flag operations that lost their in-memory execution handles.
   */
  override async onStart() {
    this._record = this.ctx.storage.kv.get<ConversationRecord>('conversation') ?? null;
    // A new object has no saved conversation yet. Leave the private record null until initialize()
    // creates the record; this hook does not provision a sandbox.
    if (!this._record) return;
    if (this.record.review) {
      await this.schedule(1, 'recoverRequestChangesToolPart', undefined, { idempotent: true });
    }
    this.setState(this.publicState);
    // offline, blocked, and waiting_for_user are stable across wakes: none requires
    // reconstructing an in-flight operation. The remaining states need explicit recovery.
    switch (this.record.lifecycle.status) {
      case 'offline':
      case 'blocked':
        // Offline awaits a message; blocked awaits Resume. Neither should start work on wake.
        return;
      case 'waiting_for_user':
        // The sandbox is ready for input; restore its idle shutdown using the saved expiry.
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
  }

  override validateStateChange(_state: ConversationState, source: Connection | 'server') {
    if (source !== 'server') throw new Error('Conversation state is managed by PrairieLearn');
  }

  /** SDK restart recovery preserves buffered output but must never repeat file edits. */
  protected override async onChatRecovery() {
    if (this._record) {
      await this.schedule(1, 'recoverRequestChangesToolPart', undefined, { idempotent: true });
    }
    if (this._record && !this.record.review && this.record.lifecycle.status !== 'blocked') {
      this.block('runtime_failed');
    }
    return { continue: false };
  }

  /** Restore a request_changes tool part that SDK restart recovery persisted after the wake hook. */
  async recoverRequestChangesToolPart() {
    if (!this.record.review || this.active || this.sandboxShutdown) return;
    if (
      this.record.lifecycle.status === 'blocked' &&
      this.record.lifecycle.reason !== 'runtime_failed'
    ) {
      return;
    }
    if (!this.reviewPart()) return;
    if (this.savedOutcome()) {
      await this.continueReview();
      return;
    }
    if (
      !['waiting_for_agent', 'waiting_for_user', 'blocked', 'offline'].includes(
        this.record.lifecycle.status,
      )
    ) {
      return;
    }
    this.setRecord(
      this.record.sandboxId
        ? { ...this.record, lifecycle: { status: 'waiting_for_user' } }
        : { ...this.record, sandboxId: null, lifecycle: { status: 'offline' } },
    );
    if (this.record.sandboxId) await this.scheduleDeadline('idle');
  }

  private block(reason: BlockedReason) {
    this.setRecord({
      ...this.record,
      lifecycle: { status: 'blocked', reason },
      deadline: null,
    });
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
    } else {
      await this.stopLive(true);
    }
  }

  /** Stop retains admission until both sandbox cleanup and SDK completion finish. */
  private async stopLive(shutdown = false) {
    const active = this.active;
    if (!active) {
      this.block('runtime_failed');
      return;
    }
    if (this.record.review && !this.savedOutcome()) {
      await this.backupAndShutdown();
      return;
    }
    active.shutdown ||= shutdown;
    this.setRecord({ ...this.record, lifecycle: { status: 'stopping' }, deadline: null });
    active.stop ??= active.execution.stop();
    await active.stop;
  }

  /** SDK inbound-message hook: admit one input and return its sandbox output stream. */
  override async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    if (!options) throw new Error('Missing SDK chat options');
    // The SDK identifies continuations; saved tool history supplies their result.
    const continuation = options.continuation === true;
    if (continuation && this.sandboxShutdown) await this.sandboxShutdown;
    const outcome = continuation ? this.savedOutcome() : null;
    if (continuation && !outcome) throw new Error('No saved review outcome');
    const operation = this.reviewOperation;
    const live = this.active;
    if (
      continuation &&
      outcome &&
      live &&
      operation?.resolveNativeCall &&
      operation.callId === this.record.review?.callId
    ) {
      await this.advanceLocalBaseline(outcome);
      live.requestId = options.requestId;
      live.sdkFinished = Promise.withResolvers<undefined>();
      const stream = live.execution.openStream();
      this.setRecord({ ...this.record, lifecycle: { status: 'waiting_for_agent' } });
      await this.scheduleDeadline('turn');
      const resolve = operation.resolveNativeCall;
      operation.resolveNativeCall = null;
      resolve(outcome);
      const abort = () => {
        void this.stopLive().catch((error: unknown) => {
          this.reportError(error);
          this.block('runtime_failed');
        });
      };
      options.abortSignal?.addEventListener('abort', abort, { once: true });
      void live.execution.finished.finally(() =>
        options.abortSignal?.removeEventListener('abort', abort),
      );
      return createUIMessageStreamResponse({ stream });
    }
    const checkedSandboxId = this.record.sandboxId;
    const lost =
      checkedSandboxId !== null &&
      !(await this.env.CourseSandbox.getByName(checkedSandboxId).isRunning());
    if (
      this.active ||
      (!continuation && this.record.review) ||
      (!continuation && this.recovering) ||
      (!continuation && !['offline', 'waiting_for_user'].includes(this.record.lifecycle.status))
    ) {
      throw new Error('The course agent sandbox is not ready.');
    }
    // Capture input before asynchronous setup allows another connection to change history.
    const message = this.messages.at(-1);
    if (!continuation && message?.role !== 'user') throw new Error('Expected a new user message');
    const text = message!.parts.map((part) => (part.type === 'text' ? part.text : '')).join('\n');
    const abandoned = lost && this.record.sandboxId === checkedSandboxId;
    if (abandoned) this.abandonLostSandbox();
    const startup = this.record.sandboxId === null;
    const source = this.record.config;
    this.setRecord({
      ...this.record,
      // A user message acknowledges an earlier loss unless this message found it.
      sandboxLost: abandoned || (continuation && this.record.sandboxLost),
      sandboxId: startup ? crypto.randomUUID() : this.record.sandboxId,
      lifecycle: { status: startup ? 'starting' : 'waiting_for_agent' },
    });
    this.native ??= new CodexAppServerClient(this.sandbox);
    const execution = new SandboxTurn(this.sandbox, this.native, {
      messageId: crypto.randomUUID(),
      text: outcome ? { callId: this.record.review!.callId, result: outcome } : text,
      startup,
      onReview: async ({ callId }, ready) => {
        if (this.reviewOperation?.resolveNativeCall) {
          throw new Error('A review is already pending');
        }
        const result = Promise.withResolvers<RequestChangesResult>();
        const operation: ReviewOperation = {
          callId,
          resolveNativeCall: result.resolve,
          delivery: null,
        };
        this.reviewOperation = operation;
        try {
          const snapshot: ReviewSnapshot = await this.sandbox.captureReview(source);
          this.clearReview();
          snapshot.additions.forEach((file, index) =>
            this.ctx.storage.kv.put(`review-file:${index}`, file.contents),
          );
          this.setRecord({
            ...this.record,
            review: {
              callId,
              request_changes_tool_part: {
                messageId: this.active!.execution.messageId,
                partId: callId,
              },
              snapshot: {
                ...snapshot,
                additions: snapshot.additions.map(({ path }) => ({ path, contents: '' })),
              },
              status: 'pending',
              jobSequenceId: null,
              error: null,
              decision: null,
            },
          });
          ready();
          await this.active!.sdkFinished.promise;
          this.setRecord({
            ...this.record,
            lifecycle: { status: 'waiting_for_user' },
            deadline: null,
          });
          await this.scheduleDeadline('idle');
        } catch (error) {
          if (this.reviewOperation === operation) this.reviewOperation = null;
          throw error;
        }
        return result.promise;
      },
      prepare: async () => {
        await this.scheduleDeadline('turn');
        if (startup) await this.sandbox.prepare(this.record.config, this.record.checkpoint);
        if (outcome) {
          await this.sandbox.stopProcesses();
          await this.advanceLocalBaseline(outcome);
        }
      },
      thread: {
        model: this.record.config.model,
        instructions: buildInstructions(this.record.courseContext ?? undefined, source.type),
        threadId: this.record.nativeThreadId,
      },
      onThread: (nativeThreadId) => this.setRecord({ ...this.record, nativeThreadId }),
      onReady: () => this.setRecord({ ...this.record, lifecycle: { status: 'waiting_for_agent' } }),
      onAccepted: (nativeTurnId) => this.stash({ nativeTurnId }),
    });
    const active: ActiveTurn = {
      requestId: options.requestId,
      execution,
      sdkFinished: Promise.withResolvers<undefined>(),
      released: Promise.withResolvers<undefined>(),
      stop: null,
      shutdown: false,
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

  /** SDK completion hook: release the SDK half of the active operation. */
  protected override async onChatResponse(result: ChatResponseResult) {
    if (this.active?.requestId === result.requestId) this.active.sdkFinished.resolve(undefined);
  }

  /** The single completion path chooses waiting, startup cleanup, or deadline shutdown. */
  private async finishTurn(active: ActiveTurn) {
    const result = await active.execution.finished;
    const reviewIncorporated =
      this.record.review && this.native?.hasIncorporatedReview(this.record.review.callId);
    if (result.stopped || result.error) this.native = null;
    if (result.error) {
      this.reportError(result.error);
      this.block(result.phase === 'startup' ? 'startup_failed' : 'runtime_failed');
    }
    await active.sdkFinished.promise;
    if (this.active !== active) return;
    try {
      await active.stop;
    } finally {
      this.active = null;
      active.released.resolve(undefined);
      if (active.stop) this.native = null;
    }
    if (this.reviewOperation) {
      this.reviewOperation.resolveNativeCall = null;
      if (!this.reviewOperation.delivery) this.reviewOperation = null;
    }
    if (this.record.review) {
      if (this.savedOutcome() && !result.error && (!result.stopped || reviewIncorporated)) {
        this.clearReview();
      } else {
        // Stop before native acceptance must leave an actionable Resume, not an
        // offline conversation whose settled review silently rejects new messages.
        if (this.savedOutcome() && result.stopped && !result.error) {
          this.block(result.phase === 'startup' ? 'startup_failed' : 'runtime_failed');
        }
        return;
      }
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

  /** Explicit Resume repairs the sandbox; it never repeats an interrupted prompt. */
  async resume(): Promise<boolean> {
    const review = this.record.review;
    if (review?.decision && !this.savedOutcome()) {
      if (this.recovering || this.reviewOperation?.delivery) return false;
      this.recovering = true;
      try {
        if (review.decision.decision === 'denied') {
          return await this.recordReviewOutcome({
            callId: review.callId,
            result: {
              decision: 'denied',
              publication: { status: 'not_attempted' },
              sync: { status: 'not_attempted' },
            },
          });
        }
        const url = new URL(
          `pl/api/course-agent/conversations/${this.name}/jobs/${review.jobSequenceId}/outcome`,
          this.env.PL_SERVICE_URL.endsWith('/')
            ? this.env.PL_SERVICE_URL
            : `${this.env.PL_SERVICE_URL}/`,
        );
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${this.env.PL_SERVICE_TOKEN}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          if (response.status === 404) {
            this.setRecord({
              ...this.record,
              review: {
                ...review,
                status: 'blocked',
                error: 'The save job could not be verified. Inspect it before retrying.',
              },
            });
          }
          throw new Error('Could not retrieve the save outcome.');
        }
        const saved = SavedJobOutcomeSchema.parse(await response.json());
        if (saved.jobSequenceId !== review.jobSequenceId) {
          throw new Error('Save job does not match the pending review.');
        }
        if (saved.status === 'running') return false;
        if (saved.status === 'blocked' || !saved.result) {
          this.setRecord({
            ...this.record,
            review: { ...review, status: 'blocked', error: saved.error },
          });
          throw new Error(
            saved.error ?? 'Saving was interrupted. Inspect the job before retrying.',
          );
        }
        return await this.recordReviewOutcome({ callId: review.callId, result: saved.result });
      } finally {
        this.recovering = false;
      }
    }
    // Another Resume or an unfinished turn must not modify this sandbox concurrently.
    if (this.record.lifecycle.status !== 'blocked' || this.active || this.recovering) return false;
    const reason = this.record.lifecycle.reason;
    this.recovering = true;
    try {
      switch (reason) {
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
      if (this.record.review && this.savedOutcome()) {
        this.continueInBackground(() => this.continueReview());
      }
      return true;
    } finally {
      this.recovering = false;
    }
  }

  /** Discard interrupted setup while retaining the last committed checkpoint. */
  private async discardStartup() {
    try {
      if (this.record.sandboxId) await this.sandbox.destroy();
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

  private reviewPart() {
    const callId = this.record.review?.callId;
    for (const message of this.messages) {
      const part = message.parts.find((part) => isToolUIPart(part) && part.toolCallId === callId);
      if (part && isToolUIPart(part)) return { message, part };
    }
    return null;
  }

  private savedOutcome() {
    const saved = this.reviewPart();
    return saved?.part.state === 'output-available'
      ? RequestChangesResultSchema.parse(saved.part.output)
      : null;
  }

  private clearReview() {
    this.record.review?.snapshot.additions.forEach((_, index) =>
      this.ctx.storage.kv.delete(`review-file:${index}`),
    );
    this.setRecord({ ...this.record, review: null });
  }

  /** Before the agent continues, make saved local files the next review's baseline. */
  private async advanceLocalBaseline(result: RequestChangesResult) {
    const review = this.record.review;
    if (result.publication.status !== 'saved_locally' || !review) return;
    await this.sandbox.advanceLocalBaseline([
      ...review.snapshot.additions.map((file, index) => ({
        path: file.path,
        contents: this.ctx.storage.kv.get<string>(`review-file:${index}`)!,
      })),
      ...review.snapshot.deletions.map((file) => ({ path: file.path, contents: null })),
    ]);
  }

  /** The review remains available without restoring or waking a sandbox. */
  getPendingReview() {
    const review = this.record.review;
    if (
      !review ||
      !['waiting_for_user', 'offline', 'blocked'].includes(this.record.lifecycle.status) ||
      !this.reviewPart() ||
      this.savedOutcome()
    ) {
      return null;
    }
    return {
      callId: review.callId,
      request_changes_tool_part: review.request_changes_tool_part,
      status: review.status,
      jobSequenceId: review.jobSequenceId,
      error: review.error,
      snapshot: {
        ...review.snapshot,
        additions: review.snapshot.additions.map((file, index) => ({
          ...file,
          contents: this.ctx.storage.kv.get<string>(`review-file:${index}`)!,
        })),
      },
    } satisfies PendingReview;
  }

  /** Claim before PL starts external work; conflicting approvals cannot publish twice. */
  recordReviewDecision(decision: ReviewDecision): boolean {
    const review = this.record.review;
    if (!review || review.callId !== decision.callId) return false;
    if (review.decision) return JSON.stringify(review.decision) === JSON.stringify(decision);
    if (!['waiting_for_user', 'offline', 'blocked'].includes(this.record.lifecycle.status)) {
      return false;
    }
    if (
      !this.messages.some(
        (message) =>
          message.id === review.request_changes_tool_part.messageId &&
          message.parts.some(
            (part) =>
              isToolUIPart(part) &&
              part.toolCallId === review.callId &&
              part.state === 'input-available',
          ),
      )
    ) {
      return false;
    }
    this.setRecord({
      ...this.record,
      review: {
        ...review,
        status: 'running',
        decision,
        jobSequenceId: decision.decision === 'approved' ? decision.jobSequenceId : null,
      },
    });
    return true;
  }

  /** Authenticated callbacks are accepted only for the frozen call and exact result. */
  async recordReviewOutcome(outcome: ReviewOutcome): Promise<boolean> {
    const pending = this.reviewOperation;
    // Old callbacks are checked against saved history without replacing a newer review.
    if (pending && pending.callId !== outcome.callId) return this.acceptReviewOutcome(outcome);
    const operation: ReviewOperation = pending ?? {
      callId: outcome.callId,
      resolveNativeCall: null,
      delivery: null,
    };
    if (operation.delivery) {
      return JSON.stringify(operation.delivery.result) === JSON.stringify(outcome.result)
        ? operation.delivery.done
        : false;
    }
    this.reviewOperation = operation;
    const delivery = { result: outcome.result, done: this.acceptReviewOutcome(outcome) };
    operation.delivery = delivery;
    try {
      return await delivery.done;
    } finally {
      // Continuing the agent can create its next review before this delivery returns.
      if (this.reviewOperation === operation) {
        operation.delivery = null;
        if (!operation.resolveNativeCall) this.reviewOperation = null;
      }
    }
  }

  private async acceptReviewOutcome(outcome: ReviewOutcome): Promise<boolean> {
    const history = this.messages;
    for (const message of history) {
      for (const part of message.parts) {
        if (
          isToolUIPart(part) &&
          part.toolCallId === outcome.callId &&
          part.state === 'output-available'
        ) {
          if (
            JSON.stringify(RequestChangesResultSchema.parse(part.output)) !==
            JSON.stringify(outcome.result)
          ) {
            return false;
          }
          if (this.record.review?.callId === outcome.callId && !this.active) {
            this.continueInBackground(() => this.continueReview());
          }
          return true;
        }
      }
    }
    const review = this.record.review;
    if (
      !review ||
      review.callId !== outcome.callId ||
      review.decision?.decision !== outcome.result.decision
    ) {
      return false;
    }
    if (!this.sandboxShutdown) {
      this.setRecord({
        ...this.record,
        lifecycle: { status: 'waiting_for_agent' },
        deadline: null,
      });
    }
    // Publish the saved result before resuming the native call. Its completion
    // notification belongs to the closed review stream, not the new response.
    await this.persistMessages(
      history.map((message) => ({
        ...message,
        parts: message.parts.map((part) =>
          isToolUIPart(part) && part.toolCallId === outcome.callId
            ? {
                type: 'tool-request_changes' as const,
                toolCallId: part.toolCallId,
                input: part.input,
                state: 'output-available' as const,
                output: outcome.result,
              }
            : part,
        ),
      })),
    );
    const stored = this.messages
      .flatMap((message) => message.parts)
      .find(
        (part) =>
          isToolUIPart(part) &&
          part.toolCallId === outcome.callId &&
          part.state === 'output-available',
      );
    if (!stored) throw new Error('SDK did not persist review result');
    this.continueInBackground(() => this.continueSavedTurn());
    return true;
  }

  /**
   * Return to the caller once the result is durable: the agent's follow-up turn can outlast
   * any HTTP timeout. A failed continuation leaves Resume available to retry it.
   */
  private continueInBackground(continuation: () => Promise<void>) {
    void this.keepAliveWhile(continuation).catch((error: unknown) => {
      this.reportError(error);
      if (this.record.lifecycle.status !== 'blocked') this.block('runtime_failed');
    });
  }

  private async continueSavedTurn() {
    const result = await this.continueLastTurn();
    if (result.status !== 'completed' && result.status !== 'aborted') this.block('runtime_failed');
  }

  /** Scheduled and explicit recovery uses only the saved tool result, never old user input. */
  async continueReview() {
    if (!this.record.review || this.active || this.sandboxShutdown || !this.savedOutcome()) {
      return;
    }
    this.setRecord({
      ...this.record,
      lifecycle: { status: 'waiting_for_agent' },
      deadline: null,
    });
    await this.continueSavedTurn();
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
