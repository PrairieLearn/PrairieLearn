import { expect, it, vi } from 'vitest';

import { CourseAgentSnapshotSchema } from '@prairielearn/course-agent-protocol';

const mock = vi.hoisted(() => ({ snapshot: vi.fn(), persist: vi.fn() }));
vi.mock('./ephemeral-runtime.js', () => ({ getEphemeralCourseAgentSnapshot: mock.snapshot }));
vi.mock('../../../models/course-agent.js', () => ({ persistCourseAgentSnapshot: mock.persist }));

import { reconcileCourseAgentConversation } from './reconcile.js';

it('uses the observed run ID when a new run starts during a reconciliation poll', async () => {
  const conversationId = '7c7d78ce-5f84-4e94-a616-09fae056a5b2';
  const newRunId = '17d94d08-eb5c-4e48-a2f6-8318e62b92e4';
  const snapshot = CourseAgentSnapshotSchema.parse({
    conversationId,
    sandboxId: 'sandbox',
    activeRunId: null,
    status: 'waiting_for_user',
    response: 'Done',
    error: null,
    events: [
      {
        sequence: 1,
        type: 'user.message',
        occurredAt: new Date().toISOString(),
        data: { runId: newRunId },
      },
    ],
  });
  mock.snapshot.mockResolvedValue(snapshot);
  await reconcileCourseAgentConversation({
    conversationId,
    sandboxId: 'sandbox',
    runId: 'older-run',
    courseId: '1',
    userId: '2',
  });
  expect(mock.persist).toHaveBeenCalledExactlyOnceWith({ snapshot, runId: newRunId });
});
