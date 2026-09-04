import type { UIMessage, UIMessageChunk } from 'ai';

import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';

export type CourseAgentMessage = UIMessage<
  { createdAt: string; failure?: string },
  never,
  { activity: { input: { label: string }; output: { label: string } } }
>;

/** Translate one run, not the entire conversation replayed by the Worker. */
export function courseAgentUIStream(runId: string) {
  let active = false;
  let finished = false;
  let sequence = -Infinity;
  let text = '';
  let textStarted = false;
  let restoring = false;
  const pendingTools = new Set<string>();
  const textId = `${runId}:text`;

  return new TransformStream<CourseAgentEvent, UIMessageChunk>({
    transform(event, controller) {
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

      function startTool(id: string, label: string) {
        if (pendingTools.has(id)) return;
        pendingTools.add(id);
        controller.enqueue({
          type: 'tool-input-available',
          toolCallId: id,
          toolName: 'activity',
          input: { label },
          providerExecuted: true,
        });
      }

      function endTool(id: string, label: string, failed = false) {
        startTool(id, label);
        pendingTools.delete(id);
        controller.enqueue(
          failed
            ? { type: 'tool-output-error', toolCallId: id, errorText: label }
            : { type: 'tool-output-available', toolCallId: id, output: { label } },
        );
      }

      function appendText(next: string) {
        // UI-message deltas are append-only; never silently duplicate a replacement response.
        if (!next.startsWith(text)) {
          throw new Error('The agent replaced an already streamed response.');
        }
        if (next === text) return;
        if (!textStarted) {
          controller.enqueue({ type: 'text-start', id: textId });
          textStarted = true;
        }
        controller.enqueue({ type: 'text-delta', id: textId, delta: next.slice(text.length) });
        text = next;
      }

      switch (event.type) {
        case 'sandbox.starting':
          restoring = event.data.restoring === true;
          startTool(`${runId}:startup`, restoring ? 'Restoring agent' : 'Starting agent');
          break;
        case 'sandbox.ready':
          if (pendingTools.has(`${runId}:startup`)) {
            endTool(`${runId}:startup`, restoring ? 'Restored agent' : 'Started agent');
          }
          break;
        case 'tool.started':
        case 'tool.completed':
        case 'tool.failed': {
          const id = `${runId}:tool:${String(event.data.operationId ?? event.sequence)}`;
          const label = String(event.data.label ?? 'Used a tool');
          if (event.type === 'tool.started') startTool(id, label);
          else endTool(id, label, event.type === 'tool.failed');
          break;
        }
        case 'assistant.delta':
          appendText(
            event.data.replace
              ? String(event.data.text ?? '')
              : text + String(event.data.text ?? ''),
          );
          break;
        case 'agent.completed':
        case 'run.failed': {
          if (event.type === 'agent.completed' && typeof event.data.response === 'string') {
            appendText(event.data.response);
          }
          const failure =
            event.type === 'run.failed'
              ? String(event.data.message ?? 'The request could not be completed.')
              : undefined;
          for (const id of pendingTools) endTool(id, 'Interrupted', true);
          if (textStarted) controller.enqueue({ type: 'text-end', id: textId });
          controller.enqueue({
            type: 'finish',
            finishReason: failure ? 'error' : 'stop',
            messageMetadata: { createdAt: event.occurredAt, ...(failure ? { failure } : {}) },
          });
          finished = true;
          break;
        }
      }
    },
    flush() {
      if (!finished) {
        throw new Error('The course-agent stream ended before the response was complete.');
      }
    },
  });
}
