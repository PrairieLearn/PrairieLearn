import { expect, it } from 'vitest';

import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';

import { conversationContext } from './conversation-context.js';

it('replays only bounded user and assistant history, not telemetry or tool output', () => {
  const events: CourseAgentEvent[] = [
    {
      sequence: 0,
      type: 'user.message',
      occurredAt: '2026-09-04T12:00:00Z',
      data: { text: 'Create an assessment' },
    },
    {
      sequence: 1,
      type: 'agent.completed',
      occurredAt: '2026-09-04T12:00:00Z',
      data: { response: 'Created Homework 1.' },
    },
    {
      sequence: 2,
      type: 'tool.completed',
      occurredAt: '2026-09-04T12:00:00Z',
      data: { stdout: 'Private telemetry' },
    },
  ];
  expect(JSON.parse(conversationContext(events))).toEqual([
    { role: 'user', text: 'Create an assessment' },
    { role: 'assistant', text: 'Created Homework 1.' },
  ]);
  expect(
    conversationContext(Array.from({ length: 50 }, () => events[0])).length,
  ).toBeLessThanOrEqual(20000);
  expect(JSON.parse(conversationContext(Array.from({ length: 50 }, () => events[0])))).toHaveLength(
    20,
  );
});
