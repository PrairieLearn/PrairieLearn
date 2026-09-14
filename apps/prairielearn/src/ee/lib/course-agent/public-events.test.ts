import { describe, expect, it } from 'vitest';

import { publicCourseAgentEvent } from './public-events.js';

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
        type: 'git.push.approval.requested',
        data: { approvalId: 'approval-id', diff: 'private diff' },
      })?.data,
    ).toEqual({ approvalId: 'approval-id' });
    expect(
      publicCourseAgentEvent({
        ...base,
        type: 'tool.completed',
        data: { operationId: 'tool-1', label: 'Read question.html', rawOutput: 'internal' },
      })?.data,
    ).toEqual({ operationId: 'tool-1', label: 'Read question.html' });
  });

  it('preserves the synced revision used to decide whether the page needs refreshing', () => {
    expect(
      publicCourseAgentEvent({
        sequence: 1,
        occurredAt: '2026-09-10T12:00:00Z',
        type: 'sync.completed',
        data: { approvalId: 'approval', commitSha: 'abc', internal: 'private' },
      })?.data,
    ).toEqual({ approvalId: 'approval', commitSha: 'abc' });
  });
});
