import type { UIMessageChunk } from 'ai';

import type { PushSyncResult, ReviewOutcome } from '@prairielearn/course-agent-types';

import type { DynamicToolCallParams } from '../../generated/types/v2/DynamicToolCallParams.js';

import type { CodexAppServerClient } from './codex.js';
import type { CourseSandbox } from './sandbox.js';

interface TurnResult {
  phase: 'startup' | 'execution';
  stopped: boolean;
  error?: unknown;
}

/** One turn's cancellation and output; the workspace owns the longer-lived native connection. */
export class SandboxTurn {
  private abort = new AbortController();
  private interruptible = false;
  private stopping: Promise<void> | null = null;
  readonly finished: Promise<TurnResult>;
  readonly messageId: string;
  readonly stream: ReadableStream<UIMessageChunk>;

  constructor(
    private sandbox: DurableObjectStub<CourseSandbox>,
    private native: CodexAppServerClient,
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
    this.messageId = options.messageId;
    this.stream = native.beginTurn(options.messageId, options.onReview);
    this.finished = this.execute(options);
  }

  openStream() {
    return this.native.openStream(this.messageId);
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
