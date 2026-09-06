import { describe, expect, it } from 'vitest';

import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';

import { publicCourseAgentEvent, publicCourseAgentStream } from './public-events.js';

describe('public course-agent transcript', () => {
  it('omits runtime telemetry and projects allowed fields instead of copying raw data', () => {
    const base = { sequence: 1, occurredAt: '2026-09-03T12:00:00Z' };
    expect(
      publicCourseAgentEvent({
        ...base,
        type: 'agent.started',
        data: { threadId: 'private-thread' },
      }),
    ).toBeNull();
    expect(
      publicCourseAgentEvent({ ...base, type: 'usage.updated', data: { input_tokens: 123 } }),
    ).toBeNull();
    expect(
      publicCourseAgentEvent({
        ...base,
        type: 'tool.completed',
        data: { operationId: 'tool-1', label: 'Read question.html', rawOutput: 'internal' },
      })?.data,
    ).toEqual({ operationId: 'tool-1', label: 'Read question.html' });
  });

  it('filters a fragmented stream without exposing diagnostics', async () => {
    const events: CourseAgentEvent[] = [
      {
        sequence: 0,
        occurredAt: '2026-09-03T12:00:00Z',
        type: 'agent.started',
        data: { threadId: 'private-thread' },
      },
      {
        sequence: 1,
        occurredAt: '2026-09-03T12:00:00Z',
        type: 'assistant.delta',
        data: { text: 'Héllo' },
      },
    ];
    const input = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
    const stream = new ReadableStream<string>({
      start(controller) {
        for (const character of input) controller.enqueue(character);
        controller.close();
      },
    }).pipeThrough(publicCourseAgentStream());
    const reader = stream.getReader();
    const output = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      output.push(value);
    }
    const serialized = JSON.stringify(output);
    expect(serialized).toContain('Héllo');
    expect(serialized).not.toContain('private-thread');
    expect(output).not.toContain('agent.started');
  });
});
