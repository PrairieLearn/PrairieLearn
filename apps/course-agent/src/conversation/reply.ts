import type { UIMessageChunk } from 'ai';

export type ReplyState =
  | { status: 'idle' }
  | { status: 'running'; assistantMessageId: string; streamId: string | null }
  | { status: 'failed'; error: { code: string; message: string } };

/** A live execution handle. Persisted messages and output belong to the SDK. */
export class Reply {
  state: ReplyState = { status: 'idle' };
  readonly abort = new AbortController();
  httpStream: ReadableStream<UIMessageChunk> | null = null;
  httpDetached = false;
  private changed = Promise.withResolvers<undefined>();

  update(state: ReplyState) {
    this.state = state;
    this.changed.resolve(undefined);
    this.changed = Promise.withResolvers<undefined>();
  }

  async wait(previous: ReplyState, signal: AbortSignal) {
    signal.throwIfAborted();
    if (this.state !== previous) return;
    let onAbort: () => void = () => {};
    try {
      await Promise.race([
        this.changed.promise,
        new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(signal.reason);
          signal.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }
}
