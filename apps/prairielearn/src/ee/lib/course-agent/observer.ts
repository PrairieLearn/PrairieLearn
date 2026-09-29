import type { ChatProvider, PendingTool } from '@prairielearn/course-agent-contract';
import { logger } from '@prairielearn/logger';

import type { CourseAgentConversation } from '../../../lib/db-types.js';

import { notify } from './events.js';
import { dispatchHostTool } from './host-tools.js';
import { recordUsage } from './usage.js';

const observers = new Map<string, AbortController>();
/** Keep host execution and accounting attached when the browser leaves the page. */
export async function observe(
  conversation: CourseAgentConversation,
  chat: ChatProvider,
  prepareTool: (tool: PendingTool) => Promise<void>,
) {
  if (observers.has(conversation.id)) return;
  const controller = new AbortController();
  observers.set(conversation.id, controller);
  const timeout = setTimeout(() => controller.abort(), 6 * 60 * 60_000);
  timeout.unref();
  let close: (() => void) | undefined;
  let reading = false;
  let dirty = false;
  let observedExecution = false;
  const cleanup = () => {
    clearTimeout(timeout);
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
        await notify(conversation.id);
        const values = Object.values(snapshot.executions ?? {});
        observedExecution ||= values.some((value) => value.status === 'running');
        if (observedExecution && !values.some((value) => value.status === 'running')) {
          controller.abort();
        }
      }
    } catch (error) {
      logger.error('Course agent observation stopped', { conversation_id: conversation.id, error });
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
      (call) =>
        dispatchHostTool(call, (incoming) =>
          prepareTool({
            id: incoming.id,
            sequence: incoming.sequence!,
            name: incoming.name,
            args: incoming.input,
          }),
        ),
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
