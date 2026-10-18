import type { UIMessageChunk } from 'ai';

/**
 * Hands one generated reply to two consumers: SDK history persistence and the
 * HTTP response streamed to PrairieLearn. The request waits for the stream to
 * become available, not for generation to finish: saveMessages() creates it
 * through onChatMessage(), but only resolves once the whole turn is over.
 */
export class HttpReplyBridge {
  readonly abort = new AbortController();
  private readonly reply = Promise.withResolvers<ReadableStream<UIMessageChunk>>();

  /**
   * Splits the reply into two copies: the returned one is for the SDK, which
   * persists it to the conversation's history; the other is handed to the
   * caller, which streams it back to PrairieLearn.
   */
  attachReplyStream(reply: ReadableStream<UIMessageChunk>): ReadableStream<UIMessageChunk> {
    const [forHistory, forHttp] = reply.tee();
    this.reply.resolve(forHttp);
    return forHistory;
  }

  /**
   * Unblocks the HTTP handler if the SDK finished without supplying a stream.
   * Rejecting an already-resolved promise leaves the handed-off stream alone.
   */
  failIfReplyNotStarted(reason: unknown = new Error('The turn ended without producing a reply')) {
    this.reply.reject(reason);
  }

  /**
   * The caller's copy of the reply. Cancelling it aborts the turn.
   *
   * TODO: PrairieLearn closing its request doesn't reliably cancel this stream
   * inside the Durable Object, so Stop should become an explicit request.
   */
  async waitForReplyStream(): Promise<ReadableStream<UIMessageChunk>> {
    const reader = (await this.reply.promise).getReader();
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
