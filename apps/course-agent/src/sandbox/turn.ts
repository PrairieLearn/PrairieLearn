import type { UIMessageChunk } from 'ai';

import type { DynamicToolCallParams } from '../../generated/types/v2/DynamicToolCallParams.js';

import type { CodexAppServerClient, ToolReply, TurnInput } from './codex.js';
import type { CourseSandbox } from './sandbox.js';

interface TurnResult {
  phase: 'startup' | 'execution';
  stopped: boolean;
  error?: unknown;
}

/** One turn's cancellation and output; the sandbox owns the longer-lived native connection. */
export class SandboxTurn {
  private abort = new AbortController();
  private interruptible = false;
  private stopping: Promise<void> | null = null;
  readonly finished: Promise<TurnResult>;
  readonly stream: ReadableStream<UIMessageChunk>;

  constructor(
    private sandbox: DurableObjectStub<CourseSandbox>,
    private native: CodexAppServerClient,
    options: {
      messageId: string;
      input: TurnInput;
      onReview?: (call: DynamicToolCallParams) => Promise<ToolReply>;
      startup: boolean;
      prepare: () => Promise<void>;
      /** Runs alongside the runner start; the thread starts only after both finish. */
      addCourseFiles?: () => Promise<void>;
      thread: Parameters<CodexAppServerClient['thread']>[0];
      onThread: (id: string) => void;
      onReady: () => void;
      /** Receives the native turn ID, or null when an earlier attempt already submitted it. */
      onAccepted: (id: string | null) => void;
      log: (event: string) => void;
    },
  ) {
    let replied = false;
    this.stream = native.beginTurn(options.messageId, options.onReview).pipeThrough(
      new TransformStream<UIMessageChunk, UIMessageChunk>({
        transform(chunk, controller) {
          if (!replied && (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta')) {
            replied = true;
            options.log('turn_first_delta');
          }
          controller.enqueue(chunk);
        },
      }),
    );
    this.finished = this.execute(options);
  }

  private get stopped() {
    return this.abort.signal.aborted;
  }

  /** Stop waits for cleanup, even if the SDK has already cancelled its stream. */
  async stop() {
    this.abort.abort();
    this.stopping ??= (async () => {
      if (this.interruptible) {
        try {
          await this.native.interrupt();
        } catch {
          // Acceptance may be unknown, or Codex may fail to acknowledge Stop.
          this.native.close();
          await this.sandbox.stopProcesses();
        }
      }
    })();
    try {
      await this.stopping;
    } catch (error) {
      // Cleanup failure must finish the response as blocked, not wait forever
      // for a terminal event from a process we could not stop.
      this.native.closeStream(error);
      throw error;
    }
    const result = await this.finished;
    // Stop may arrive after native completion while the SDK is still finishing its response.
    if (!result.stopped) {
      this.native.close();
      await this.sandbox.stopProcesses();
    }
  }

  private async execute(
    options: ConstructorParameters<typeof SandboxTurn>[2],
  ): Promise<TurnResult> {
    const result: TurnResult = { phase: options.startup ? 'startup' : 'execution', stopped: false };
    try {
      await options.prepare();
      this.abort.signal.throwIfAborted();
      // Wait for both even if one fails, so failed startup cleanup never races a step still running.
      const [files, runner] = await Promise.allSettled([
        options.addCourseFiles?.(),
        this.native.connect().then(() => options.log('turn_runner_connected')),
      ]);
      if (files.status === 'rejected') throw files.reason;
      if (runner.status === 'rejected') throw runner.reason;
      if (options.addCourseFiles) options.log('turn_workspace_ready');
      this.abort.signal.throwIfAborted();
      options.onThread(await this.native.thread(options.thread));
      this.abort.signal.throwIfAborted();
      options.onReady();
      this.abort.signal.throwIfAborted();
      this.interruptible = true;
      result.phase = 'execution';
      await this.native.run(options.input, options.onAccepted);
      await this.native.finished;
    } catch (error) {
      if (!this.stopped) result.error = error;
    } finally {
      // Normal completion keeps Codex and background tools available for the next message.
      // Explicit Stop and failures must leave no old tools able to keep editing.
      if (this.stopped || result.error) {
        this.native.close();
        try {
          await this.sandbox.stopProcesses();
        } catch (error) {
          result.error = error;
        }
      }
      result.stopped = this.stopped;
      this.native.closeStream(result.error);
    }
    return result;
  }
}
