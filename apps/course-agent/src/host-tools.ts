import { hostToolResultSchema } from '@prairielearn/course-agent-contract';

import type { DynamicToolCallResponse } from './generated/v2/DynamicToolCallResponse.js';

interface Executor {
  id: string;
  send(data: string): void;
}
const failure = (text: string): DynamicToolCallResponse => ({
  success: false,
  contentItems: [{ type: 'inputText', text }],
});

/** Live calls only: losing the native process never replays a host side effect. */
export class HostTools {
  private pending = new Map<
    string,
    {
      executor: string;
      complete(result: DynamicToolCallResponse): void;
    }
  >();

  call(
    name: string,
    input: unknown,
    executors: Iterable<Executor>,
    timeoutMs = 30_000,
  ): Promise<DynamicToolCallResponse> {
    // Send to one connection, never broadcast to every tab's watcher.
    const executor = Array.from(executors)[0];
    if (!executor) {
      return Promise.resolve(failure('No host executor connected. Reconnect the page and retry.'));
    }
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(
        () => complete(failure('Host tool timed out; outcome may be unknown. It was not retried.')),
        timeoutMs,
      );
      const complete = (result: DynamicToolCallResponse) => {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve(result);
      };
      this.pending.set(id, { executor: executor.id, complete });
      try {
        executor.send(JSON.stringify({ type: 'host-tool-call', id, name, input }));
      } catch {
        complete(failure('Host delivery failed; outcome may be unknown. It was not retried.'));
      }
    });
  }

  receive(executorId: string, message: unknown) {
    const parsed = hostToolResultSchema.safeParse(message);
    if (!parsed.success) return;
    const { id, result } = parsed.data;
    const pending = this.pending.get(id);
    if (!pending || pending.executor !== executorId) return;
    pending.complete({
      success: result.ok,
      contentItems: [
        {
          type: 'inputText',
          text: result.ok ? JSON.stringify(result.output) : result.error,
        },
      ],
    });
  }

  /** Stop/disconnect invalidate correlation; late replies cannot complete a later call. */
  cancel(error: string, executorId?: string) {
    for (const call of this.pending.values()) {
      if (!executorId || call.executor === executorId) call.complete(failure(error));
    }
  }
}
