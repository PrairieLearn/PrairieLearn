import { describe, expect, it } from 'vitest';

import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';

import {
  getCourseAgentActivity,
  getCourseAgentDuration,
  getCourseAgentResponse,
  groupCourseAgentTurns,
} from './courseAgentEvents.js';

function event(
  sequence: number,
  type: CourseAgentEvent['type'],
  data: Record<string, unknown> = {},
): CourseAgentEvent {
  return { sequence, type, occurredAt: '2026-09-03T12:00:00.000Z', data };
}

describe('groupCourseAgentTurns', () => {
  it('keeps lifecycle and tool activity with the turn that produced it', () => {
    const turns = groupCourseAgentTurns([
      event(0, 'user.message', { text: 'First' }),
      event(1, 'sandbox.starting'),
      event(2, 'tool.started', { operationId: 'one' }),
      event(3, 'assistant.delta', { text: 'Done' }),
      event(4, 'agent.completed'),
      event(5, 'user.message', { text: 'Second' }),
      event(6, 'tool.started', { operationId: 'two' }),
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[0].events.map(({ sequence }) => sequence)).toEqual([1, 2, 3, 4]);
    expect(turns[1].events.map(({ sequence }) => sequence)).toEqual([6]);
  });

  it('attaches legacy startup events to the first user message', () => {
    const turns = groupCourseAgentTurns([
      event(0, 'sandbox.starting'),
      event(1, 'sandbox.ready'),
      event(2, 'user.message', { text: 'Hello' }),
    ]);

    expect(turns[0].events.map(({ sequence }) => sequence)).toEqual([0, 1]);
  });
});

describe('getCourseAgentActivity', () => {
  it('shows restoration and marks a failed startup as failed', () => {
    const events = [event(1, 'sandbox.starting', { restoring: true })];
    expect(getCourseAgentActivity(events)[0]).toMatchObject({
      label: 'Restoring agent',
      status: 'pending',
    });
    expect(getCourseAgentActivity([...events, event(2, 'run.failed')])[0]).toMatchObject({
      label: 'Restoring agent',
      status: 'failed',
    });
  });

  it('shows tools that emit only a completion event', () => {
    expect(
      getCourseAgentActivity([
        event(1, 'tool.completed', { operationId: 'one', label: 'Created question.html' }),
      ])[0],
    ).toMatchObject({ label: 'Created question.html', status: 'completed', kind: 'tool' });
  });

  it('abstracts lifecycle events and uses the completed tool label', () => {
    expect(
      getCourseAgentActivity([
        event(1, 'sandbox.starting', { restoring: false }),
        event(2, 'workspace.seeded'),
        event(3, 'sandbox.ready'),
        event(4, 'tool.started', { operationId: 'one', label: 'Edited files' }),
        event(5, 'tool.completed', {
          operationId: 'one',
          label: 'Edited questions/example/question.html',
        }),
      ]),
    ).toEqual([
      {
        key: 'sandbox-1',
        sequence: 1,
        label: 'Started agent',
        status: 'completed',
        kind: 'lifecycle',
      },
      {
        key: 'tool-one',
        sequence: 4,
        label: 'Edited questions/example/question.html',
        status: 'completed',
        kind: 'tool',
      },
    ]);
  });
});

describe('streamed responses and elapsed time', () => {
  it('joins text chunks before rendering Markdown and accepts the canonical final answer', () => {
    const events = [
      event(1, 'assistant.delta', { text: 'Use `py' }),
      event(2, 'assistant.delta', { text: 'thon`.' }),
    ];
    expect(getCourseAgentResponse(events)).toBe('Use `python`.');
    expect(
      getCourseAgentResponse([
        ...events,
        event(3, 'assistant.delta', { text: 'Use `python`.', replace: true }),
      ]),
    ).toBe('Use `python`.');
  });

  it('stops elapsed time at completion, including failures', () => {
    const start = '2026-09-03T11:59:48.000Z';
    expect(
      getCourseAgentDuration(
        start,
        [event(1, 'agent.completed')],
        Date.parse('2026-09-03T12:05:00Z'),
      ),
    ).toBe(12);
    expect(
      getCourseAgentDuration(start, [event(1, 'run.failed')], Date.parse('2026-09-03T12:05:00Z')),
    ).toBe(12);
    expect(getCourseAgentDuration(start, [], Date.parse('2026-09-03T11:59:50Z'))).toBe(2);
  });
});
