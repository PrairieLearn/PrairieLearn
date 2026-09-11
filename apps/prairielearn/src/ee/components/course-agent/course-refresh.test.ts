import { describe, expect, it } from 'vitest';

import type { CourseAgentMessage } from '../../lib/course-agent/ui-stream.js';

import { courseRefreshMessageId } from './course-refresh.js';

const message: CourseAgentMessage = {
  id: 'reply',
  role: 'assistant',
  parts: [
    { type: 'text', text: 'Published the update.', state: 'done' },
    {
      type: 'data-courseSynced',
      data: {
        approvalId: 'approval',
        commitSha: 'new',
        syncedAt: '2026-09-10T12:01:00Z',
      },
    },
  ],
};
const page = { busy: false, courseCommitSha: 'old', pageRenderedAt: '2026-09-10T12:00:00Z' };

describe('course refresh visibility', () => {
  it('offers refresh for a completed reply that changed the displayed course revision', () => {
    expect(courseRefreshMessageId({ ...page, messages: [message] })).toBe('reply');
  });

  it('hides refresh during a turn, after reload, and when the revision already matches', () => {
    for (const override of [
      { busy: true },
      { pageRenderedAt: '2026-09-10T12:02:00Z' },
      { courseCommitSha: 'new' },
    ]) {
      expect(courseRefreshMessageId({ ...page, ...override, messages: [message] })).toBeUndefined();
    }
  });

  it('hides refresh for failures and tool-only replies', () => {
    expect(
      courseRefreshMessageId({
        ...page,
        messages: [
          {
            ...message,
            metadata: { createdAt: page.pageRenderedAt, failure: 'Interrupted' },
          },
        ],
      }),
    ).toBeUndefined();
    expect(
      courseRefreshMessageId({
        ...page,
        messages: [
          {
            ...message,
            parts: message.parts.filter((part) => part.type !== 'text'),
          },
        ],
      }),
    ).toBeUndefined();
  });

  it('offers refresh only for the latest turn, not subsequent uses', () => {
    expect(
      courseRefreshMessageId({
        ...page,
        messages: [message, { ...message, id: 'latest-sync' }],
      }),
    ).toBe('latest-sync');
    for (const role of ['user', 'assistant'] as const) {
      expect(
        courseRefreshMessageId({
          ...page,
          messages: [message, { id: 'next', role, parts: [{ type: 'text', text: 'Hello' }] }],
        }),
      ).toBeUndefined();
    }
  });

  it('does not offer refresh for legacy markers without a timestamp', () => {
    expect(
      courseRefreshMessageId({
        ...page,
        messages: [
          {
            ...message,
            parts: [
              {
                type: 'data-courseSynced',
                data: { approvalId: 'old', commitSha: null, syncedAt: '' },
              },
            ],
          },
        ],
      }),
    ).toBeUndefined();
  });
});
