import type { UIMessageChunk } from 'ai';

import type { ChatContext } from '../http/chat-request.js';

/**
 * Connects one chat turn's reply to the HTTP request that started it.
 *
 * `saveMessages()` runs `onChatMessage` internally and only resolves once the
 * turn is over, so the request can't get the live reply from its return value.
 * Instead, the request creates a `TurnStream` and waits on `callerStream()`;
 * `onChatMessage` passes the reply to `split()`, which resolves that wait.
 */
export class TurnStream {
  /** Aborts the turn. Passed to `saveMessages()`. */
  readonly abort = new AbortController();

  private readonly callerReply: Promise<ReadableStream<UIMessageChunk>>;
  private resolveCallerReply!: (stream: ReadableStream<UIMessageChunk>) => void;
  private rejectCallerReply!: (reason: unknown) => void;

  constructor(readonly context: ChatContext | undefined) {
    this.callerReply = new Promise((resolve, reject) => {
      this.resolveCallerReply = resolve;
      this.rejectCallerReply = reject;
    });
  }

  /**
   * Splits the reply into two copies: the returned one is for the SDK, which
   * persists it to the conversation's history; the other is handed to the
   * caller, which streams it back to PrairieLearn.
   */
  split(reply: ReadableStream<UIMessageChunk>): ReadableStream<UIMessageChunk> {
    const [forSdk, forCaller] = reply.tee();
    this.resolveCallerReply(forCaller);
    return forSdk;
  }

  /**
   * Marks the turn as over. If no reply was produced, the caller gets this
   * error instead of waiting forever. Has no effect after `split()`.
   */
  end(reason: unknown = new Error('The turn ended without producing a reply')) {
    this.rejectCallerReply(reason);
  }

  /**
   * The caller's copy of the reply. Cancelling it aborts the turn.
   *
   * TODO: PrairieLearn closing its request doesn't reliably cancel this stream
   * inside the Durable Object, so Stop should become an explicit request.
   */
  async callerStream(): Promise<ReadableStream<UIMessageChunk>> {
    const reader = (await this.callerReply).getReader();
    const abort = this.abort;
    return new ReadableStream<UIMessageChunk>({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      },
      cancel(reason) {
        abort.abort(reason);
        // Not awaited: cancelling one branch of a `tee()` only settles once the
        // other branch (the SDK's) is cancelled too.
        reader.cancel(reason).catch(() => {});
      },
    });
  }
}
