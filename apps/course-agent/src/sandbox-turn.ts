import type { PushSyncResult, ReviewOutcome } from '@prairielearn/course-agent-types';

import type { DynamicToolCallParams } from '../generated/types/v2/DynamicToolCallParams.js';

import { CodexAppServerClient } from './codex.js';
import type { CourseSandbox } from './sandbox.js';

interface TurnResult {
  phase: 'startup' | 'execution';
  stopped: boolean;
  parked: boolean;
  error?: unknown;
}

/** One in-memory execution, including setup, cancellation, streaming and cleanup. */
export class SandboxTurn {
  private abort = new AbortController();
  private native: CodexAppServerClient;
  private interruptible = false;
  private parked = false;
  private stopping: Promise<void> | null = null;
  readonly finished: Promise<TurnResult>;

  constructor(
    private sandbox: DurableObjectStub<CourseSandbox>,
    options: {
      messageId: string;
      text: string | ReviewOutcome;
      onReview?: (call: DynamicToolCallParams, ready: () => void) => Promise<PushSyncResult>;
      startup: boolean;
      prepare: () => Promise<void>;
      thread: { model: string; instructions: string; threadId: string | null };
      onThread: (id: string) => void;
      onReady: () => void;
      onAccepted: (id: string) => void;
    },
  ) {
    this.native = new CodexAppServerClient(sandbox, options.messageId, options.onReview);
    this.finished = this.execute(options);
  }

  openStream() {
    return this.native.openStream();
  }

  get messageId() {
    return this.native.messageId;
  }

  /** Release the SDK stream before checkpointing destroys the native waiter. */
  async park() {
    this.parked = true;
    await this.sandbox.stopProcesses();
    this.native.closeStream();
    await this.finished;
  }

  get stream() {
    return this.native.stream;
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
    await this.finished;
  }

  private async execute(
    options: ConstructorParameters<typeof SandboxTurn>[1],
  ): Promise<TurnResult> {
    const result: TurnResult = {
      phase: options.startup ? 'startup' : 'execution',
      stopped: false,
      parked: false,
    };
    try {
      await options.prepare();
      this.abort.signal.throwIfAborted();
      await this.native.connect();
      this.abort.signal.throwIfAborted();
      options.onThread(await this.native.thread(options.thread));
      this.abort.signal.throwIfAborted();
      options.onReady();
      this.abort.signal.throwIfAborted();
      this.interruptible = true;
      result.phase = 'execution';
      await this.native.run(options.text, options.onAccepted);
      await this.native.finished;
    } catch (error) {
      if (!this.stopped && !this.parked) result.error = error;
    } finally {
      try {
        await this.sandbox.stopProcesses();
      } catch (error) {
        result.error = error;
      }
      result.stopped = this.stopped;
      result.parked = this.parked;
      this.native.closeStream(result.error);
    }
    return result;
  }
}
