import {
  AIChatAgent,
  type ChatResponseResult,
  type OnChatMessageOptions,
} from '@cloudflare/ai-chat';
import { MessageType } from '@cloudflare/ai-chat/types';
import type { DirectoryBackupRecord } from '@cloudflare/sandbox';
import type { Connection, ConnectionContext } from 'agents';
import { createUIMessageStreamResponse } from 'ai';
import { z } from 'zod';

import {
  type BlockedReason,
  type ConversationLifecycle,
  type ConversationState,
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
}
// Destruction is a private phase because the replacement checkpoint is committed
// before container removal can be attempted.
type Runtime = RuntimeData &
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
  shutdown: boolean;
}

/** The private record is authoritative; SDK state exposes lifecycle and its deadline to browsers. */
export class Conversation extends AIChatAgent<Env, ConversationState> {
  override initialState: ConversationState = { status: 'offline', deadlineAt: null };
  private runtime: Runtime | null = null;
  // Process connections and completion promises exist only in this DO instance.
  private active: ActiveTurn | null = null;
  private recovering = false;

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
    return {
      ...(lifecycle.status === 'destroying' ? { status: 'suspending' as const } : lifecycle),
      deadlineAt: this.record.deadline?.at ?? null,
    };
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
    if (this.runtime && this.record.lifecycle.status !== 'blocked') this.block('runtime_failed');
    return { continue: false };
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
    active.shutdown ||= shutdown;
    this.setRuntimeState({ ...this.record, lifecycle: { status: 'stopping' }, deadline: null });
    await active.execution.stop();
  }

  /** SDK inbound-message hook: admit one input and return its sandbox output stream. */
  override async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    if (!options) throw new Error('Missing SDK chat options');
    if (
      this.active ||
      this.recovering ||
      !['offline', 'waiting_for_user'].includes(this.record.lifecycle.status)
    ) {
      throw new Error('The course agent workspace is not ready.');
    }
    // Capture input before asynchronous setup allows another connection to change history.
    const message = this.messages.at(-1);
    if (message?.role !== 'user') throw new Error('Expected a new user message');
    const text = message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('\n');
    const startup = this.record.lifecycle.status === 'offline';
    this.setRuntimeState({
      ...this.record,
      sandboxId: startup ? crypto.randomUUID() : this.record.sandboxId,
      lifecycle: { status: startup ? 'starting' : 'waiting_for_agent' },
    });
    const execution = new SandboxTurn(this.sandbox, {
      messageId: crypto.randomUUID(),
      text,
      startup,
      prepare: async () => {
        await this.scheduleDeadline('turn');
        if (startup) await this.sandbox.prepare(this.record.config, this.record.checkpoint);
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
