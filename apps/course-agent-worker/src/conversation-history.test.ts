import { expect, it } from 'vitest';

import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';

import { conversationHistory } from './conversation-history.js';

it('keeps all available messages for recovery, without replaying internal telemetry', () => {
  const events: CourseAgentEvent[] = Array.from({ length: 50 }, (_, index) => ({
    sequence: index,
    occurredAt: '2026-09-04T00:00:00Z',
    type: index % 2 === 0 ? 'user.message' : 'agent.completed',
    data: index % 2 === 0 ? { text: 'a'.repeat(1000) } : { response: 'b'.repeat(1000) },
  }));
  events.push({
    sequence: 50,
    occurredAt: '2026-09-04T00:00:00Z',
    type: 'tool.completed',
    data: { stdout: 'internal' },
  });
  const history = conversationHistory(events);
  expect(history).toHaveLength(50);
  expect(JSON.stringify(history).length).toBeGreaterThan(20_000);
  expect(history[0]).toEqual({ role: 'user', text: 'a'.repeat(1000) });
  expect(history[49]).toEqual({ role: 'assistant', text: 'b'.repeat(1000) });
});
