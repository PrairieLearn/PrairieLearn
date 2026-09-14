import { type UIMessage, type UIMessageChunk, uiMessageChunkSchema } from 'ai';

import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';

interface CourseSync {
  approvalId: string;
  commitSha: string | null;
  syncedAt: string;
}

export type CourseAgentMessage = UIMessage<
  { createdAt: string; failure?: string },
  {
    approvalRequested: { approvalId: string };
    courseSynced: CourseSync;
  },
  { activity: { input: { label: string }; output: { label: string } } }
>;

/** Add course workflow notifications around the SDK's native message chunks. */
export function courseAgentUIStream(runId: string) {
  let active = false;
  let finished = false;
  let sequence = -Infinity;
  const pendingSyncs = new Map<string, CourseSync>();
  return new TransformStream<CourseAgentEvent, UIMessageChunk>({
    async transform(event, controller) {
      if (finished || event.sequence <= sequence) return;
      sequence = event.sequence;
      if (event.type === 'user.message') {
        active = event.data.runId === runId;
        if (active) {
          controller.enqueue({
            type: 'start',
            messageId: runId,
            messageMetadata: { createdAt: event.occurredAt },
          });
        }
        return;
      }
      if (!active) return;
      if (event.type === 'ui.chunk') {
        const parsed = await uiMessageChunkSchema().validate!(event.data.chunk);
        if (!parsed.success) throw parsed.error;
        controller.enqueue(parsed.value);
      } else if (event.type === 'git.push.approval.requested') {
        controller.enqueue({
          type: 'data-approvalRequested',
          data: { approvalId: String(event.data.approvalId) },
          transient: true,
        });
      } else if (event.type === 'sync.completed') {
        pendingSyncs.set(String(event.data.approvalId), {
          approvalId: String(event.data.approvalId),
          commitSha: typeof event.data.commitSha === 'string' ? event.data.commitSha : null,
          syncedAt: event.occurredAt,
        });
      } else if (event.type === 'agent.completed' || event.type === 'run.failed') {
        const failure =
          event.type === 'run.failed'
            ? String(event.data.message ?? 'The request could not be completed.')
            : undefined;
        for (const [id, data] of pendingSyncs) {
          controller.enqueue({ type: 'data-courseSynced', id, data });
        }
        controller.enqueue({
          type: 'finish',
          finishReason: failure ? 'error' : 'stop',
          messageMetadata: { createdAt: event.occurredAt, ...(failure ? { failure } : {}) },
        });
        finished = true;
      }
    },
    flush() {
      if (!finished) {
        throw new Error('The course-agent stream ended before the response was complete.');
      }
    },
  });
}
