import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';

// Native Codex sessions retain tool results and compaction. This transcript is only a recovery
/** fallback when no session exists, so retain every available message rather than truncating it. */
export function conversationHistory(events: CourseAgentEvent[]) {
  return events.flatMap((event) => {
    if (event.type === 'user.message' && typeof event.data.text === 'string') {
      return [{ role: 'user', text: event.data.text }];
    }
    if (event.type === 'agent.completed' && typeof event.data.response === 'string') {
      return [{ role: 'assistant', text: event.data.response }];
    }
    return [];
  });
}
