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
  type ConversationState,
  type PushSyncResult,
  PushSyncResultSchema,
  type ReviewOutcome,
  reviewRevision,
} from '@prairielearn/course-agent-types';

import { SandboxTurn } from '../sandbox-turn.js';

import { buildInstructions } from './instructions.js';

const CourseContextSchema = z.object({
  courseTitle: z.string().max(500),
  courseShortName: z.string().max(100),
});
interface Deadline {
  at: string;
  kind: 'turn' | 'idle';
  sandboxId: string;
}
interface RuntimeData {
  config: { repository: string; branch: string; model: string };
  courseContext: z.infer<typeof CourseContextSchema> | null;
  nativeThreadId: string | null;
  checkpoint: DirectoryBackupRecord | null;
  deadline: Deadline | null;
  baseCommit: string | null;
  review: { callId: string; revision: string } | null;
}
// Destruction is a private phase because the replacement checkpoint is committed
// before container removal can be attempted.
type Runtime = RuntimeData &
  (
    | { lifecycle: Extract<ConversationState, { status: 'offline' }>; sandboxId: null }
    | {
        lifecycle: Exclude<ConversationState, { status: 'offline' }> | { status: 'destroying' };
        sandboxId: string | null;
      }
  );
interface ActiveTurn {
  requestId: string;
  execution: SandboxTurn;
  sdkFinished: PromiseWithResolvers<undefined>;
  shutdown: boolean;
}

/** The private record is authoritative; SDK state exposes only lifecycle to browsers. */
export class Conversation extends AIChatAgent<Env, ConversationState> {
  override initialState: ConversationState = { status: 'offline' };
  private runtime: Runtime | null = null;
  // Process connections and completion promises exist only in this DO instance.
  private active: ActiveTurn | null = null;
  private recovering = false;
  private waiter: {
    callId: string;
    result: PromiseWithResolvers<PushSyncResult>;
    delivered: boolean;
  } | null = null;

  private internalContinuation = false;
  private liveContinuation: { active: ActiveTurn; result: PushSyncResult } | null = null;
  private cleanup: Promise<void> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const handleMessage = this.onMessage.bind(this);
    // SDK chat submits can replace history before onChatMessage runs. Accept only
    // a new text message and derive its history here; clients cannot forge tool results.
    this.onMessage = async (connection, message) => {
      if (typeof message !== 'string') return;
      const frame = z.object({ type: z.string() }).passthrough().safeParse(JSON.parse(message));
      if (!frame.success) return;
      if (frame.data.type === MessageType.CF_AGENT_USE_CHAT_REQUEST) {
        if (
          this.active ||
          this.recovering ||
          this.record.review ||
          !['offline', 'waiting_for_user'].includes(this.record.lifecycle.status)
        ) {
          throw new Error('The course agent workspace is not ready.');
        }
        const request = z
          .object({
            id: z.string(),
            init: z.object({ method: z.literal('POST'), body: z.string() }),
          })
          .parse(frame.data);
        const body = z
          .object({
            messages: z.array(
              z.object({
                id: z.string(),
                role: z.enum(['user', 'assistant', 'system']),
                parts: z.array(z.unknown()),
              }),
            ),
          })
          .parse(JSON.parse(request.init.body));
        const input = z
          .object({
            id: z.string(),
            role: z.literal('user'),
            parts: z.array(z.object({ type: z.literal('text'), text: z.string() })).min(1),
          })
          .parse(body.messages.at(-1));
        return handleMessage(
          connection,
          JSON.stringify({
            type: frame.data.type,
            id: request.id,
            init: {
              method: 'POST',
              body: JSON.stringify({
                messages: [...(await this.sessions.session().getHistory()), input],
              }),
            },
          }),
        );
      }
      if (
        [
          'cf_agent_stream_resume_request',
          'cf_agent_stream_resume_ack',
          'cf_agent_chat_request_cancel',
        ].includes(frame.data.type)
      ) {
        return handleMessage(connection, message);
      }
    };
  }

  private get record() {
    if (!this.runtime) throw new Error('Conversation is not initialized');
    return this.runtime;
  }

  private get sandbox() {
    if (!this.record.sandboxId) throw new Error('No live sandbox');
    return this.env.CourseSandbox.getByName(this.record.sandboxId);
  }

  private get publicState(): ConversationState {
    const lifecycle = this.record.lifecycle;
    return lifecycle.status === 'destroying' ? { status: 'suspending' } : lifecycle;
  }

  /** Save a complete private record before publishing its public projection. */
  private setRuntimeState(next: Runtime) {
    this.ctx.storage.kv.put('conversation', next);
    this.runtime = next;
    this.setState(this.publicState);
  }

  /**
   * Built-in SDK hook when this Durable Object starts or wakes after idling.
   * getAgentByName() runs this before initialize() for a newly addressed object.
   * Restore saved state and flag operations that lost their in-memory execution handles.
   */
  override async onStart() {
    this.runtime = this.ctx.storage.kv.get<Runtime>('conversation') ?? null;
    // A new object has no saved conversation yet. Leave runtime null until initialize()
    // creates the record; this hook does not provision a sandbox.
    if (!this.runtime) return;
    if (!this.record.review) {
      const unresolved = this.messages
        .flatMap((message) => message.parts)
        .find(
          (part) =>
            isToolUIPart(part) &&
            part.type === 'tool-push_sync' &&
            part.state === 'input-available',
        );
      if (unresolved && isToolUIPart(unresolved)) {
        const input = z.object({ revision: z.string() }).parse(unresolved.input);
        this.setRuntimeState({
          ...this.record,
          review: { callId: unresolved.toolCallId, revision: input.revision },
          lifecycle: { status: 'waiting_for_user' },
        });
      }
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
        // The workspace is ready for input; restore its idle shutdown using the saved expiry.
        await this.scheduleDeadline('idle', this.record.deadline?.at);
        return;
      case 'starting':
        // Setup lost its execution handle. Resume must discard the incomplete container.
        this.block('startup_failed');
        return;
      case 'refreshing_workspace':
        await this.schedule(0, 'continueReview', undefined, { idempotent: true });
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
        // Backup was interrupted. Retain the workspace and previous checkpoint for Resume to retry.
        this.block('checkpoint_failed');
    }
  }

  /**
   * Set up conversation state and pin the repository, branch, and model.
   * The sandbox is created or restored when the first message arrives.
   */
  initialize(config: { repository: string; branch: string }) {
    if (this.runtime) throw new Error('Conversation is already initialized');
    this.setRuntimeState({
      lifecycle: { status: 'offline' },
      config: { ...config, model: this.env.OPENAI_MODEL },
      courseContext: null,
      sandboxId: null,
      nativeThreadId: null,
      checkpoint: null,
      baseCommit: null,
      review: null,
      deadline: null,
    });
  }

  /**
   * Built-in SDK hook when a chat WebSocket connects.
   * Accept trusted course context from PL and send the persisted chat history to that connection.
   */
  override async onConnect(connection: Connection, context: ConnectionContext) {
    const courseContext = CourseContextSchema.parse(
      JSON.parse(context.request.headers.get('X-PL-Course-Context') ?? 'null'),
    );
    this.setRuntimeState({ ...this.record, courseContext });
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
    if (this.runtime) await this.schedule(1, 'recoverReviewCard', undefined, { idempotent: true });
    if (this.runtime && !this.record.review && this.record.lifecycle.status !== 'blocked') {
      this.block('runtime_failed');
    }
    return { continue: false };
  }

  /** Restore a card that SDK restart recovery persisted after the wake hook. */
  async recoverReviewCard() {
    if (this.record.review || this.active) return;
    const part = this.messages
      .flatMap((message) => message.parts)
      .find(
        (part) =>
          isToolUIPart(part) && part.type === 'tool-push_sync' && part.state !== 'output-available',
      );
    if (!part || !isToolUIPart(part)) return;
    const { revision } = z
      .object({ revision: z.string().regex(/^[0-9a-f]{64}$/) })
      .parse(part.input);
    if (this.record.sandboxId) {
      this.setRuntimeState({
        ...this.record,
        review: { callId: part.toolCallId, revision },
        lifecycle: { status: 'waiting_for_user' },
      });
    } else {
      this.setRuntimeState({
        ...this.record,
        sandboxId: null,
        review: { callId: part.toolCallId, revision },
        lifecycle: { status: 'offline' },
      });
    }
    if (this.record.sandboxId) await this.scheduleDeadline('idle');
  }

  private block(reason: BlockedReason) {
    this.setRuntimeState({
      ...this.record,
      lifecycle: { status: 'blocked', reason },
      deadline: null,
    });
  }

  /**
   * Save a turn or idle deadline for the current workspace and schedule onDeadline().
   * Use the supplied expiry when restoring an idle deadline; otherwise start the configured budget now.
   */
  private async scheduleDeadline(kind: Deadline['kind'], at?: string) {
    const sandboxId = this.record.sandboxId;
    if (!sandboxId) throw new Error('Deadline requires a live workspace');
    const seconds = kind === 'turn' ? this.env.AGENT_TURN_SECONDS : this.env.USER_IDLE_SECONDS;
    const deadline: Deadline = {
      at: at ?? new Date(Date.now() + Number(seconds) * 1000).toISOString(),
      kind,
      sandboxId,
    };
    this.setRuntimeState({ ...this.record, deadline });
    // Schedules use whole seconds: round up so the callback cannot fire too early.
    await this.schedule(
      new Date(Math.ceil(Math.max(Date.now(), Date.parse(deadline.at)) / 1000) * 1000),
      'onDeadline',
      deadline,
      { idempotent: true },
    );
  }

  /** Expired turns stop before backup; idle workspaces can be backed up immediately. */
  async onDeadline(expected: Deadline) {
    const current = this.record.deadline;
    // State changes can replace the deadline or workspace after a callback was queued.
    if (
      current?.at !== expected.at ||
      current.kind !== expected.kind ||
      current.sandboxId !== expected.sandboxId ||
      Date.parse(expected.at) > Date.now()
    ) {
      return;
    }
    if (expected.kind === 'idle') {
      this.cleanup = this.parkAndShutdown();
      try {
        await this.cleanup;
      } finally {
        this.cleanup = null;
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
    if (this.record.review) {
      if (this.cleanup) return;
      this.cleanup = this.parkAndShutdown();
      try {
        await this.cleanup;
      } finally {
        this.cleanup = null;
      }
      return;
    }
    active.shutdown ||= shutdown;
    this.setRuntimeState({ ...this.record, lifecycle: { status: 'stopping' }, deadline: null });
    await active.execution.stop();
  }

  /** SDK inbound-message hook: admit one input and return its sandbox output stream. */
  override async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    if (!options) throw new Error('Missing SDK chat options');
    const live = this.liveContinuation;
    this.liveContinuation = null;
    if (live) {
      live.active.requestId = options.requestId;
      live.active.sdkFinished = Promise.withResolvers<undefined>();
      const stream = live.active.execution.openStream();
      this.setRuntimeState({ ...this.record, lifecycle: { status: 'waiting_for_agent' } });
      this.waiter!.delivered = true;
      this.waiter!.result.resolve(live.result);
      const abort = () => {
        void this.stopLive().catch((error: unknown) => {
          console.error(error);
          this.block('runtime_failed');
        });
      };
      options.abortSignal?.addEventListener('abort', abort, { once: true });
      void live.active.execution.finished.finally(() =>
        options.abortSignal?.removeEventListener('abort', abort),
      );
      return createUIMessageStreamResponse({ stream });
    }
    const continuation = this.internalContinuation;
    this.internalContinuation = false;
    if (continuation && this.cleanup) await this.cleanup;
    if (
      this.active ||
      (!continuation && this.record.review) ||
      (!continuation && this.recovering) ||
      (!continuation && !['offline', 'waiting_for_user'].includes(this.record.lifecycle.status))
    ) {
      throw new Error('The course agent workspace is not ready.');
    }
    // Capture input before asynchronous setup allows another connection to change history.
    const message = this.messages.at(-1);
    if (!continuation && message?.role !== 'user') throw new Error('Expected a new user message');
    const text = message!.parts.map((part) => (part.type === 'text' ? part.text : '')).join('\n');
    const outcome = continuation ? await this.savedOutcome() : null;
    if (continuation && !outcome) throw new Error('No saved review outcome');
    const startup = this.record.sandboxId === null;
    this.setRuntimeState({
      ...this.record,
      sandboxId: startup ? crypto.randomUUID() : this.record.sandboxId,
      lifecycle: { status: startup ? 'starting' : 'waiting_for_agent' },
    });
    const execution = new SandboxTurn(this.sandbox, {
      messageId: crypto.randomUUID(),
      text: outcome ? { ...this.record.review!, result: outcome } : text,
      startup,
      onReview: async ({ callId }, ready) => {
        if (!this.record.baseCommit || (this.waiter && !this.waiter.delivered)) {
          throw new Error('A review is already pending or has no base');
        }
        const result = Promise.withResolvers<PushSyncResult>();
        this.waiter = { callId, result, delivered: false };
        try {
          const patch = await this.sandbox.freezeReview(this.record.baseCommit);
          const revision = await reviewRevision(this.record.baseCommit, patch);
          ready(revision);
          await this.active!.sdkFinished.promise;
          this.setRuntimeState({
            ...this.record,
            review: { callId, revision },
            lifecycle: { status: 'waiting_for_user' },
            deadline: null,
          });
          await this.scheduleDeadline('idle');
        } catch (error) {
          this.waiter = null;
          throw error;
        }
        return result.promise;
      },
      prepare: async () => {
        await this.scheduleDeadline('turn');
        if (startup) {
          const head = await this.sandbox.prepare(this.record.config, this.record.checkpoint);
          if (!this.record.baseCommit) this.setRuntimeState({ ...this.record, baseCommit: head });
        }
        if (outcome) {
          await this.sandbox.stopProcesses();
          await this.reconcile(outcome);
        }
      },
      thread: {
        model: this.record.config.model,
        instructions: buildInstructions(this.record.courseContext ?? undefined),
        threadId: this.record.nativeThreadId,
      },
      onThread: (nativeThreadId) => this.setRuntimeState({ ...this.record, nativeThreadId }),
      onReady: () =>
        this.setRuntimeState({ ...this.record, lifecycle: { status: 'waiting_for_agent' } }),
      onAccepted: (nativeTurnId) => this.stash({ nativeTurnId }),
    });
    const active: ActiveTurn = {
      requestId: options.requestId,
      execution,
      sdkFinished: Promise.withResolvers<undefined>(),
      shutdown: false,
    };
    this.active = active;
    const abort = () => {
      void this.stopLive().catch((error: unknown) => {
        console.error(error);
        this.block('runtime_failed');
      });
    };
    options.abortSignal?.addEventListener('abort', abort, { once: true });
    if (options.abortSignal?.aborted) abort();
    // SDK Stop can finish its response before the container stops. Keep cleanup alive.
    void this.keepAliveWhile(() => this.finishTurn(active))
      .catch((error: unknown) => {
        console.error(error);
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
    if (result.error) {
      console.error(result.error);
      this.block(result.phase === 'startup' ? 'startup_failed' : 'runtime_failed');
    }
    await active.sdkFinished.promise;
    if (this.active !== active) return;
    this.active = null;
    this.waiter = null;
    if (this.record.review) {
      if (!result.parked && (await this.savedOutcome()) && !result.error && !result.stopped) {
        this.setRuntimeState({ ...this.record, review: null });
      } else {
        return;
      }
    }
    if (this.record.lifecycle.status === 'blocked') return;
    if (result.stopped && result.phase === 'startup') {
      await this.discardStartup();
    } else if (active.shutdown) {
      await this.backupAndShutdown();
    } else {
      this.setRuntimeState({ ...this.record, lifecycle: { status: 'waiting_for_user' } });
      await this.scheduleDeadline('idle');
    }
  }

  /** Explicit Resume repairs the workspace; it never repeats an interrupted prompt. */
  async resume(): Promise<boolean> {
    // Another Resume or an unfinished turn must not modify this workspace concurrently.
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
      if (this.record.review && (await this.savedOutcome())) await this.continueReview();
      return true;
    } finally {
      this.recovering = false;
    }
  }

  /** Discard interrupted setup while retaining the last committed checkpoint. */
  private async discardStartup() {
    try {
      if (this.record.sandboxId) await this.sandbox.destroy();
      this.setRuntimeState({
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

  /** Park the native waiter and settle SDK persistence before backing up its files. */
  private async parkAndShutdown() {
    const active = this.active;
    if (active) {
      await active.execution.park();
      await active.sdkFinished.promise;
      await active.execution.finished;
      // finishTurn also waits on these promises; give its completion path ownership.
      while (this.active === active) await scheduler.wait(0);
    }
    await this.backupAndShutdown();
  }

  private async reviewPart() {
    const callId = this.record.review?.callId;
    for (const message of this.messages) {
      const part = message.parts.find((part) => isToolUIPart(part) && part.toolCallId === callId);
      if (part && isToolUIPart(part)) return { message, part };
    }
    return null;
  }

  private async savedOutcome() {
    const saved = await this.reviewPart();
    return saved?.part.state === 'output-available'
      ? PushSyncResultSchema.parse(saved.part.output)
      : null;
  }

  /** Read frozen bytes from the live or restored checkpoint, never from the current diff. */
  async getPendingReview() {
    if (
      !this.record.review ||
      !['waiting_for_user', 'offline'].includes(this.record.lifecycle.status) ||
      this.waiter?.delivered ||
      (await this.savedOutcome())
    ) {
      return null;
    }
    if (this.cleanup) await this.cleanup;
    if (!this.record.sandboxId) {
      this.setRuntimeState({
        ...this.record,
        sandboxId: crypto.randomUUID(),
        lifecycle: { status: 'starting' },
      });
      try {
        await this.sandbox.prepare(this.record.config, this.record.checkpoint);
        this.setRuntimeState({ ...this.record, lifecycle: { status: 'waiting_for_user' } });
        await this.scheduleDeadline('idle');
      } catch (error) {
        this.block('startup_failed');
        throw error;
      }
    }
    const saved = await this.reviewPart();
    const messageId = saved?.message.id ?? this.active?.execution.messageId;
    if (!messageId || !this.record.baseCommit) throw new Error('Review card is not available');
    return {
      ...this.record.review,
      card: { messageId, partId: this.record.review.callId },
      repository: this.record.config.repository,
      branch: this.record.config.branch,
      baseCommit: this.record.baseCommit,
      patch: await this.sandbox.readReview(),
    };
  }

  private async reconcile(result: PushSyncResult) {
    if (result.publication.status === 'published') {
      await this.sandbox.reconcilePublication(
        result.publication.commitSha,
        this.record.config.branch,
      );
      this.setRuntimeState({ ...this.record, baseCommit: result.publication.commitSha });
    }
  }

  /** Authenticated callbacks are accepted only for the frozen call and exact result. */
  async recordReviewOutcome(outcome: ReviewOutcome): Promise<boolean> {
    const history = this.messages;
    for (const message of history) {
      for (const part of message.parts) {
        if (
          isToolUIPart(part) &&
          part.toolCallId === outcome.callId &&
          part.state === 'output-available'
        ) {
          if (
            z.object({ revision: z.literal(outcome.revision) }).safeParse(part.input).success ===
            false
          ) {
            return false;
          }
          if (
            JSON.stringify(PushSyncResultSchema.parse(part.output)) !==
            JSON.stringify(outcome.result)
          ) {
            return false;
          }
          if (this.record.review?.callId === outcome.callId && !this.active) {
            await this.continueReview();
          }
          return true;
        }
      }
    }
    const review = this.record.review;
    if (!review || review.callId !== outcome.callId || review.revision !== outcome.revision) {
      return false;
    }
    if (!this.cleanup) {
      this.setRuntimeState({
        ...this.record,
        lifecycle: { status: 'refreshing_workspace' },
        deadline: null,
      });
    }
    const active = this.active;
    if (active && !this.cleanup && this.waiter?.callId === outcome.callId) {
      await this.reconcile(outcome.result);
      this.liveContinuation = { active, result: outcome.result };
      const response = await this.continueLastTurn();
      if (response.status !== 'completed') {
        throw new Error('Could not persist native review response');
      }
      await active.sdkFinished.promise;
    } else {
      // saveMessages persists the result before starting the private continuation. SDK
      // recovery retains it if the DO restarts between that write and native acceptance.
      this.internalContinuation = true;
      const result = await this.saveMessages((messages) =>
        messages.map((message) => ({
          ...message,
          parts: message.parts.map((part) =>
            isToolUIPart(part) && part.toolCallId === outcome.callId
              ? {
                  type: 'tool-push_sync' as const,
                  toolCallId: part.toolCallId,
                  input: part.input,
                  state: 'output-available' as const,
                  output: outcome.result,
                }
              : part,
          ),
        })),
      );
      if (result.status !== 'completed') throw new Error('Could not incorporate review result');
    }
    const stored = this.messages
      .flatMap((message) => message.parts)
      .find(
        (part) =>
          isToolUIPart(part) &&
          part.toolCallId === outcome.callId &&
          part.state === 'output-available',
      );
    if (!stored) throw new Error('SDK did not persist review result');
    return true;
  }

  /** Scheduled and explicit recovery uses only the saved tool result, never old user input. */
  async continueReview() {
    if (!this.record.review || this.active || this.cleanup || !(await this.savedOutcome())) return;
    this.setRuntimeState({
      ...this.record,
      lifecycle: { status: 'refreshing_workspace' },
      deadline: null,
    });
    this.internalContinuation = true;
    const result = await this.continueLastTurn();
    if (result.status !== 'completed') this.block('runtime_failed');
  }

  /** Commit a replacement backup before shutdown; cleanup of the old archive is independent. */
  private async backupAndShutdown() {
    this.setRuntimeState({ ...this.record, lifecycle: { status: 'suspending' }, deadline: null });
    try {
      const previous = this.record.checkpoint;
      const checkpoint = await this.sandbox.checkpoint();
      this.setRuntimeState({ ...this.record, checkpoint, lifecycle: { status: 'destroying' } });
      await this.destroyCheckpointed();
      if (previous) {
        await this.schedule(0, 'deleteCheckpoint', previous, { retry: { maxAttempts: 3 } }).catch(
          console.error,
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

  /** A committed backup is required before discarding a workspace containing edits. */
  private async destroyCheckpointed() {
    if (!this.record.checkpoint) throw new Error('No checkpoint-backed sandbox to destroy');
    try {
      if (this.record.sandboxId) await this.sandbox.destroy();
      this.setRuntimeState({ ...this.record, sandboxId: null, lifecycle: { status: 'offline' } });
    } catch (error) {
      this.block('cleanup_failed');
      throw error;
    }
  }
}
