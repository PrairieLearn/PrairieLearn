import type { ChatProvider } from '@prairielearn/course-agent-contract';
import * as Sentry from '@prairielearn/sentry';

import type { CourseAgentConversation } from '../../../lib/db-types.js';
import { selectActiveExecution } from '../../../models/course-agent-execution.js';

import { notify } from './events.js';
import { executeHostTool } from './host-tools.js';
import { recordUsage } from './usage.js';

const observers = new Map<string, AbortController>();
/** Keep host execution and accounting attached when the browser leaves the page. */
export async function observe(conversation: CourseAgentConversation, chat: ChatProvider) {
  if (observers.has(conversation.id)) return;
  const controller = new AbortController();
  observers.set(conversation.id, controller);
  const timeout = setTimeout(() => controller.abort(), 6 * 60 * 60_000);
  timeout.unref();
  let close: (() => void) | undefined;
  let reading = false;
  let dirty = false;
  // Reconcile unanswered dispatches even when the Worker has no state changes to broadcast.
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
        await recordUsage(conversation, snapshot);
        // Notifications are best-effort wakeups; browser routes also poll. Redis
        // downtime must not detach host-tool execution or usage reconciliation.
        try {
          await notify(conversation.id);
        } catch (error) {
          Sentry.captureException(error);
        }
        const values = Object.values(snapshot.executions ?? {});
        if (
          !values.some((value) => value.status === 'running') &&
          !(await selectActiveExecution(conversation.id)).active
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
  for (const controller of observers.values()) controller.abort();
}
