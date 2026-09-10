import type { CourseAgentEvent, CourseAgentSnapshot } from '@prairielearn/course-agent-protocol';

/** Reconnect to the durable event log without finishing a turn on transport loss. */
export function recoveringCourseAgentStream({
  runId,
  connect,
  snapshot,
  retryDelayMs = 1000,
}: {
  runId: string;
  connect: () => Promise<ReadableStream<CourseAgentEvent>>;
  snapshot: () => Promise<CourseAgentSnapshot>;
  retryDelayMs?: number;
}) {
  let cancelled = false;
  const isCancelled = () => cancelled;
  let reader: ReadableStreamDefaultReader<CourseAgentEvent> | undefined;
  let sequence = -1;
  return new ReadableStream<CourseAgentEvent>({
    async start(controller) {
      const emit = (event: CourseAgentEvent) => {
        if (!isCancelled() && event.sequence > sequence) {
          sequence = event.sequence;
          controller.enqueue(event);
        }
      };
      let failures = 0;
      while (!isCancelled()) {
        try {
          reader = (await connect()).getReader();
          while (!isCancelled()) {
            const next = await reader.read();
            if (next.done) break;
            emit(next.value);
          }
        } catch {
          // The persisted snapshot determines whether transport loss ended the run.
        } finally {
          reader?.releaseLock();
          reader = undefined;
        }
        if (isCancelled()) return;
        try {
          const current = await snapshot();
          for (const event of current.events) emit(event);
          failures = 0;
          if (current.activeRunId !== runId) {
            controller.close();
            return;
          }
        } catch (error) {
          if (++failures >= 5) {
            controller.error(error);
            return;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    },
    async cancel() {
      cancelled = true;
      await reader?.cancel();
    },
  });
}
