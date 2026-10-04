import type { ChatProvider } from '@prairielearn/course-agent-contract';
import * as Sentry from '@prairielearn/sentry';

import type { CourseAgentConversation } from '../../../lib/db-types.js';

import { executeHostTool } from './host-tools.js';

const observers = new Map<string, { controller: AbortController; operations: Set<string> }>();
/** Keep live host execution attached when the browser leaves the page. */
export async function observe(
  conversation: CourseAgentConversation,
  chat: ChatProvider,
  operationId: string,
) {
  const existing = observers.get(conversation.id);
  if (existing) {
    existing.operations.add(operationId);
    return;
  }
  // Register before dispatch: the initial idle snapshot must not detach the host
  // between opening its socket and Codex accepting this prompt.
  const operations = new Set([operationId]);
  const controller = new AbortController();
  observers.set(conversation.id, { controller, operations });
  const timeout = setTimeout(() => controller.abort(), 6 * 60 * 60_000);
  timeout.unref();
  let close: (() => void) | undefined;
  let reading = false;
  let dirty = false;
  // Release the host socket after terminal work even if the last state notification was lost.
  const poll = setInterval(() => void changed(), 30_000);
  poll.unref();
  const cleanup = () => {
    clearTimeout(timeout);
    clearInterval(poll);
    close?.();
    observers.delete(conversation.id);
  };
  controller.signal.addEventListener('abort', cleanup, { once: true });
  const changed = async () => {
    dirty = true;
    if (reading || controller.signal.aborted) return;
    reading = true;
    try {
      // A socket callback may mark the snapshot dirty while the read is awaiting I/O.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (dirty && !controller.signal.aborted) {
        dirty = false;
        const snapshot = await chat.getSnapshot(controller.signal);
        const values = Object.values(snapshot.executions ?? {});
        if (
          !values.some((value) => value.status === 'running') &&
          Array.from(operations).every(
            (id) => snapshot.executions?.[id] && snapshot.executions[id].status !== 'running',
          )
        ) {
          controller.abort();
        }
      }
    } catch (error) {
      // The socket can close while a snapshot read is awaiting I/O.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!controller.signal.aborted) Sentry.captureException(error);
      controller.abort();
    } finally {
      reading = false;
    }
  };
  try {
    close = await chat.watch(
      controller.signal,
      () => void changed(),
      () => controller.abort(),
      executeHostTool,
    );
    if (controller.signal.aborted) cleanup();
  } catch (error) {
    controller.abort();
    throw error;
  }
}
export function stopObservers() {
  for (const { controller } of observers.values()) controller.abort();
}
