import {
  AIChatAgent,
  type ChatResponseResult,
  type OnChatMessageOptions,
} from '@cloudflare/ai-chat';
import { MessageType } from '@cloudflare/ai-chat/types';
import type { DirectoryBackupRecord } from '@cloudflare/sandbox';
import type { Connection, ConnectionContext } from 'agents';
import { type UIMessage, createUIMessageStreamResponse } from 'ai';
import { z } from 'zod';

import {
  type BlockedReason,
  type ConversationLifecycle,
  type ConversationState,
  type PageCatalog,
  type RequestChangesResult,
  RequestChangesResultSchema,
  type Review,
  type ReviewSnapshot,
  UserMessageMetadataSchema,
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
import { resolveNavigation } from './navigation.js';
import { generateTitle } from './title.js';

// PrairieLearn proxies chat sockets through a load balancer that closes connections after 60 s
// without traffic, including idle chats and long silent turns.
const KEEPALIVE_SECONDS = 25;

const CourseContextSchema = z.object({
  // Optional while a PrairieLearn deployment that does not send it may still connect.
  courseId: z.string().regex(/^\d+$/).optional(),
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
  /** Absent in records saved before titles were generated. */
  title?: string | null;
  /** Pages the agent can open; absent in records saved before PrairieLearn sent a catalog. */
  pages?: PageCatalog;
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
  startedAt: number;
  execution: SandboxTurn;
  sdkFinished: PromiseWithResolvers<undefined>;
  /** Resolved when finishTurn releases execution ownership. */
  released: PromiseWithResolvers<undefined>;
  stop: Promise<void> | null;
  shutdown: boolean;
  /** The review whose result this turn delivers, if it is a delivery turn. */
  deliveringReviewId: string | null;
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

  private prairieLearnContext() {
    return {
      plUrl: this.env.PL_URL,
      serviceToken: this.env.PL_SERVICE_TOKEN,
      conversationId: this.name,
      courseId: this.record.courseContext?.courseId,
    };
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
      reviewId: this.record.review?.id ?? null,
      title: this.record.title ?? null,
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
    // A new object has no saved conversation yet. Leave the private record null until initialize()
    // creates the record; this hook does not provision a sandbox.
    if (!this._record) return;
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
  initialize(config: CourseSource, pages?: PageCatalog) {
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
      pages,
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

  private block(reason: BlockedReason) {
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
    const earlier = historyBefore(this.messages, message);
    const attachments = message ? attachmentsOf(message) : [];
    const checkedSandboxId = this.record.sandboxId;
    const lost =
      checkedSandboxId !== null &&
      !(await this.env.CourseSandbox.getByName(checkedSandboxId).isRunning());
    const images = await this.findImages(attachments);
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
    if (!images) throw refuse('An attached file is no longer available. Attach it again.');
    if (!continuation && !message) throw new Error('Expected a new user message');
    const abandoned = lost && this.record.sandboxId === checkedSandboxId;
    if (abandoned) this.abandonLostSandbox();
    if (message && earlier.length === 0 && !this.record.title) this.startTitle(message);
    const startup = this.record.sandboxId === null;
    const source = this.record.config;
    const location =
      message && UserMessageMetadataSchema.safeParse(message.metadata ?? {}).data?.location;
    // File parts are left out rather than joined as blank lines.
    const messageText =
      message?.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n') ?? '';
    const input: TurnInput = {
      ...(continuation && review?.result
        ? {
            tag: reviewTag(review.id),
            once: true,
            text: describeReviewResult(review.result, source.type),
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
    });
    log('turn_started', { startup });
    const native = (this.native ??= new CodexAppServerClient(this.sandbox, (target) =>
      resolveNavigation(this.prairieLearnContext(), target),
    ));
    let nativeThreadId = this.record.nativeThreadId;
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
        const toWrite = attachmentsToWrite(earlier, message, startup);
        if (toWrite.length > 0) await this.sandbox.writeAttachments(this.name, toWrite);
        if (continuation && review) await this.advanceLocalBaseline(review);
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
        pages: this.record.pages ?? [],
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
        if (continuation && review?.result) {
          // The agent now has the result: mark the delivery in chat history, so an attempt that
          // fails first leaves no marker, and drop the snapshot so new messages are admitted.
          native.emit(turnMarker(input.tag, summarizeReview(review.result)));
          this.settleReview(review.id);
        }
      },
      log,
    });
    const active: ActiveTurn = {
      requestId: options.requestId,
      startedAt,
      execution,
      sdkFinished: Promise.withResolvers<undefined>(),
      released: Promise.withResolvers<undefined>(),
      stop: null,
      shutdown: false,
      deliveringReviewId: continuation && review ? review.id : null,
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
   * Resume repairs a blocked sandbox, then delivers a waiting review result, even one that waits
   * for Resume. It never repeats an interrupted prompt. Automatic recovery passes explicit: false
   * so it only repairs; a result that does not wait for Resume is still delivered afterwards.
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
    } else if (!this.record.review?.result) {
      return false;
    }
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
