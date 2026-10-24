import {
  AIChatAgent,
  type ChatResponseResult,
  type OnChatMessageOptions,
} from '@cloudflare/ai-chat';
import { MessageType } from '@cloudflare/ai-chat/types';
import type { DirectoryBackupRecord } from '@cloudflare/sandbox';
import type { Connection, ConnectionContext } from 'agents';
import { type UIMessageChunk, createUIMessageStreamResponse } from 'ai';
import { z } from 'zod';

import { type BlockedReason, type ConversationState } from '@prairielearn/course-agent-types';

import { Codex } from '../codex.js';

import { buildInstructions } from './instructions.js';

const CourseContextSchema = z.object({
  courseTitle: z.string().max(500),
  courseShortName: z.string().max(100),
});
interface Runtime {
  config: { repository: string; branch: string; model: string };
  courseContext: z.infer<typeof CourseContextSchema> | null;
  sandboxId: string | null;
  nativeThreadId: string | null;
  checkpoint: DirectoryBackupRecord | null;
  deadlineAt: string | null;
}
interface Deadline {
  status: ConversationState['status'];
  deadlineAt: string;
  sandboxId: string | null;
}
interface LiveTurn {
  requestId: string;
  sandboxId: string | null;
  abort: AbortController;
  native: Codex | null;
  quiescent: boolean;
  sdkSettled: boolean;
}

/** The SDK owns history and active requests; only lifecycle is broadcast to browsers. */
export class Conversation extends AIChatAgent<Env, ConversationState> {
  override initialState: ConversationState = { status: 'offline' };
  private runtime: Runtime | null = null;
  private live: LiveTurn | null = null;
  private recovering = false;

  override async onStart() {
    this.runtime = (await this.ctx.storage.get<Runtime>('runtime')) ?? null;
    if (!this.runtime) {
      // Conversations from the text-only pilot still have readable SDK history.
      if (this.state.status !== 'offline') this.setState({ status: 'offline' });
      return;
    }
    switch (this.state.status) {
      case 'starting':
        await this.block('startup_failed');
        break;
      case 'waiting_for_agent':
      case 'stopping':
        await this.block('runtime_failed');
        break;
      case 'suspending':
        await this.block('checkpoint_failed');
        break;
      case 'offline':
        if (this.runtime.sandboxId) await this.block('runtime_failed');
        break;
      case 'waiting_for_user':
        await this.armDeadline();
        break;
      case 'blocked':
        break;
    }
  }

  async initialize(config: { repository: string; branch: string }) {
    if (this.runtime) throw new Error('Conversation is already initialized');
    this.runtime = {
      config: { ...config, model: this.env.OPENAI_MODEL },
      courseContext: null,
      sandboxId: null,
      nativeThreadId: null,
      checkpoint: null,
      deadlineAt: null,
    };
    await this.persist();
  }

  override async onConnect(connection: Connection, context: ConnectionContext) {
    const courseContext = CourseContextSchema.parse(
      JSON.parse(context.request.headers.get('X-PL-Course-Context') ?? 'null'),
    );
    if (this.runtime) {
      this.runtime.courseContext = courseContext;
      await this.persist();
    }
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

  protected override async onChatRecovery() {
    if (this.runtime && this.state.status !== 'blocked') await this.block('runtime_failed');
    return { continue: false };
  }

  private async persist() {
    await this.ctx.storage.put('runtime', this.runtime);
  }

  private get sandbox() {
    if (!this.runtime?.sandboxId) throw new Error('No live sandbox');
    return this.env.CourseSandbox.getByName(this.runtime.sandboxId);
  }

  private async block(reason: BlockedReason) {
    if (this.runtime) {
      this.runtime.deadlineAt = null;
      await this.persist();
    }
    this.setState({ status: 'blocked', reason });
  }

  private async armDeadline() {
    if (!this.runtime?.deadlineAt) return;
    await this.schedule(
      // Agent schedules use whole seconds; rounding down could consume the callback before expiry.
      new Date(Math.ceil(Math.max(Date.now(), Date.parse(this.runtime.deadlineAt)) / 1000) * 1000),
      'onDeadline',
      {
        status: this.state.status,
        deadlineAt: this.runtime.deadlineAt,
        sandboxId: this.runtime.sandboxId,
      } satisfies Deadline,
      { idempotent: true },
    );
  }

  async onDeadline(expected: Deadline) {
    if (
      !this.runtime ||
      expected.status !== this.state.status ||
      expected.deadlineAt !== this.runtime.deadlineAt ||
      expected.sandboxId !== this.runtime.sandboxId ||
      Date.parse(expected.deadlineAt) > Date.now()
    ) {
      return;
    }
    if (this.state.status === 'waiting_for_user') {
      await this.suspend();
    } else if (this.state.status === 'starting' || this.state.status === 'waiting_for_agent') {
      await this.stopLive();
    }
  }

  private async stopLive() {
    const live = this.live;
    this.setState({ status: 'stopping' });
    live?.abort.abort();
    if (this.runtime) {
      this.runtime.deadlineAt = null;
      await this.persist();
    }
    if (!live) {
      await this.block('runtime_failed');
      return;
    }
    // Setup observes the abort before submitting. Once submitted, an ack alone
    // is insufficient: wait for terminal output or kill and verify every tool.
    if (live.native) {
      try {
        await live.native.interrupt();
      } catch {
        try {
          await this.sandbox.quiesce();
        } catch (error) {
          await this.block('runtime_failed');
          throw error;
        }
      }
    }
  }

  protected async createReply(
    signal: AbortSignal | undefined,
    messageId: string,
    requestId: string,
  ) {
    const runtime = this.runtime;
    if (!runtime) throw new Error('Start a new conversation to edit this course.');
    if (
      this.live ||
      this.recovering ||
      !['offline', 'waiting_for_user'].includes(this.state.status)
    ) {
      throw new Error('The course agent workspace is not ready.');
    }
    if (this.state.status === 'offline' && runtime.sandboxId) {
      throw new Error('Workspace recovery is required.');
    }
    // Another connection can update SDK history while sandbox startup is awaiting I/O.
    const message = this.messages.at(-1);
    if (message?.role !== 'user') throw new Error('Expected a new user message');
    const text = message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('\n');
    const startup = this.state.status === 'offline';
    const live: LiveTurn = {
      requestId,
      sandboxId: runtime.sandboxId,
      abort: new AbortController(),
      native: null,
      quiescent: false,
      sdkSettled: false,
    };
    this.live = live;
    this.setState({ status: startup ? 'starting' : 'waiting_for_agent' });
    runtime.deadlineAt = new Date(
      Date.now() + Number(this.env.AGENT_TURN_SECONDS) * 1000,
    ).toISOString();
    const ready = Promise.withResolvers<ReadableStream<UIMessageChunk>>();
    const abort = () => {
      void this.stopLive().catch(async (error: unknown) => {
        console.error(error);
        await this.block('runtime_failed');
      });
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) live.abort.abort();
    // SDK Stop can settle its request before native cleanup. Keep this operation
    // alive and retain admission until both sides have settled.
    void this.keepAliveWhile(async () => {
      let delivered = false;
      let running = !startup;
      let failure: unknown;
      try {
        await this.persist();
        await this.armDeadline();
        if (startup) {
          runtime.sandboxId = crypto.randomUUID();
          live.sandboxId = runtime.sandboxId;
          await this.persist();
          await this.armDeadline();
          await this.sandbox.prepare(runtime.config, runtime.checkpoint);
        }
        live.abort.signal.throwIfAborted();
        const native = new Codex(this.sandbox);
        // Only expose targeted interruption after the runner is connected.
        await native.connect();
        live.abort.signal.throwIfAborted();
        runtime.nativeThreadId = await native.thread({
          model: runtime.config.model,
          instructions: buildInstructions(runtime.courseContext ?? undefined),
          threadId: runtime.nativeThreadId,
        });
        await this.persist();
        live.abort.signal.throwIfAborted();
        live.native = native;
        this.setState({ status: 'waiting_for_agent' });
        await this.armDeadline();
        live.abort.signal.throwIfAborted();
        running = true;
        const stream = await native.run(text, messageId, (nativeTurnId) =>
          this.stash({ nativeTurnId }),
        );
        if (runtime.sandboxId !== live.sandboxId || this.live !== live) {
          throw new Error('Native runtime changed');
        }
        delivered = true;
        ready.resolve(stream);
        await native.finished;
      } catch (error) {
        failure = error;
        if (!live.abort.signal.aborted) {
          console.error(error);
          await this.block(running ? 'runtime_failed' : 'startup_failed');
        }
        ready.reject(error);
      } finally {
        signal?.removeEventListener('abort', abort);
        try {
          await this.sandbox.quiesce();
          live.quiescent = true;
          if (!running && live.abort.signal.aborted) {
            await this.sandbox.destroy();
            runtime.sandboxId = null;
            if (!runtime.checkpoint) runtime.nativeThreadId = null;
            runtime.deadlineAt = null;
            await this.persist();
            this.setState({ status: 'offline' });
          }
        } catch (error) {
          console.error(error);
          await this.block(running ? 'runtime_failed' : 'startup_failed');
        }
        live.native?.closeStream(failure && !live.abort.signal.aborted ? failure : undefined);
        if (!delivered) live.sdkSettled = true;
        await this.settle(live);
      }
    }).catch(async (error: unknown) => {
      ready.reject(error);
      console.error(error);
      await this.block('runtime_failed');
    });
    return ready.promise;
  }

  protected override async onChatResponse(result: ChatResponseResult) {
    const live = this.live;
    if (!live || live.requestId !== result.requestId) return;
    live.sdkSettled = true;
    await this.settle(live);
  }

  private async settle(live: LiveTurn) {
    if (
      this.live !== live ||
      !live.sdkSettled ||
      (!live.quiescent && this.state.status !== 'blocked')
    ) {
      return;
    }
    this.live = null;
    if (
      !this.runtime ||
      this.runtime.sandboxId !== live.sandboxId ||
      !['waiting_for_agent', 'stopping'].includes(this.state.status)
    ) {
      return;
    }
    this.runtime.deadlineAt = new Date(
      Date.now() + Number(this.env.USER_IDLE_SECONDS) * 1000,
    ).toISOString();
    await this.persist();
    this.setState({ status: 'waiting_for_user' });
    await this.armDeadline();
  }

  override async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    if (!options) throw new Error('Missing SDK chat options');
    return createUIMessageStreamResponse({
      stream: await this.createReply(options.abortSignal, crypto.randomUUID(), options.requestId),
    });
  }

  async resume(): Promise<boolean> {
    if (
      this.state.status !== 'blocked' ||
      (this.live && !this.live.abort.signal.aborted) ||
      this.recovering ||
      !this.runtime
    ) {
      return false;
    }
    this.recovering = true;
    try {
      const scheduled = await this.listSchedules();
      if (scheduled.some((task) => task.callback === 'recover')) return false;
      // Schedule before acknowledging; the SDK owns the durable work record.
      await this.schedule(
        0,
        'recover',
        { reason: this.state.reason, sandboxId: this.runtime.sandboxId },
        { idempotent: true },
      );
      return true;
    } finally {
      this.recovering = false;
    }
  }

  async recover(expected: { reason: BlockedReason; sandboxId: string | null }) {
    if (
      !this.runtime ||
      (this.live && !this.live.abort.signal.aborted) ||
      this.recovering ||
      this.state.status !== 'blocked' ||
      this.state.reason !== expected.reason ||
      this.runtime.sandboxId !== expected.sandboxId
    ) {
      return;
    }
    this.recovering = true;
    try {
      if (this.live) {
        await this.sandbox.quiesce();
        this.live = null;
      }
      switch (expected.reason) {
        case 'startup_failed':
          if (this.runtime.sandboxId) await this.sandbox.destroy();
          this.runtime.sandboxId = null;
          if (!this.runtime.checkpoint) this.runtime.nativeThreadId = null;
          await this.persist();
          this.setState({ status: 'offline' });
          break;
        case 'runtime_failed':
        case 'checkpoint_failed':
          await this.suspend();
          break;
        case 'cleanup_failed':
          await this.destroyCheckpointed();
          break;
      }
    } catch (error) {
      console.error(error);
      if (this.state.status !== 'blocked') await this.block(expected.reason);
    } finally {
      this.recovering = false;
    }
  }

  private async suspend() {
    if (!this.runtime?.sandboxId) {
      await this.block('runtime_failed');
      return;
    }
    this.setState({ status: 'suspending' });
    this.runtime.deadlineAt = null;
    await this.persist();
    try {
      const previous = this.runtime.checkpoint;
      const checkpoint = await this.sandbox.checkpoint();
      this.runtime.checkpoint = checkpoint;
      await this.persist();
      await this.destroyCheckpointed();
      // Replacement is committed before the old archive can be removed.
      if (previous) {
        await this.schedule(0, 'deleteCheckpoint', previous, { retry: { maxAttempts: 3 } });
      }
    } catch (error) {
      console.error(error);
      if (this.state.status !== 'blocked' && this.state.status !== 'offline') {
        await this.block('checkpoint_failed');
      }
    }
  }

  async deleteCheckpoint(checkpoint: DirectoryBackupRecord) {
    await this.env.CourseSandbox.getByName('archive-cleanup').deleteCheckpoint(checkpoint);
  }

  private async destroyCheckpointed() {
    if (!this.runtime?.checkpoint) {
      throw new Error('No checkpoint-backed sandbox to destroy');
    }
    try {
      if (this.runtime.sandboxId) await this.sandbox.destroy();
      this.runtime.sandboxId = null;
      await this.persist();
      this.setState({ status: 'offline' });
    } catch (error) {
      await this.block('cleanup_failed');
      throw error;
    }
  }
}
