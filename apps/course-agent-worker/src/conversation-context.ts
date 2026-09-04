import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';

export function conversationContext(events: CourseAgentEvent[]) {
  const messages = events.flatMap((event) => {
    if (event.type === 'user.message' && typeof event.data.text === 'string') {
      return [{ role: 'user', text: event.data.text }];
    }
    if (event.type === 'agent.completed' && typeof event.data.response === 'string') {
      return [{ role: 'assistant', text: event.data.response }];
    }
    return [];
  });
  // Bound replay cost; the checked-out files remain the source of truth for older edits.
  const recent = messages.slice(-20);
  while (recent.length > 0 && JSON.stringify(recent).length > 20000) recent.shift();
  return JSON.stringify(recent);
}
