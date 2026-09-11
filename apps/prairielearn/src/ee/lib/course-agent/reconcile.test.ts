import { beforeEach, expect, it, vi } from 'vitest';

import { CourseAgentSnapshotSchema } from '@prairielearn/course-agent-protocol';

const mock = vi.hoisted(() => ({
  snapshot: vi.fn(),
  persist: vi.fn(),
  render: vi.fn(),
  respond: vi.fn(),
}));
vi.mock('./ephemeral-runtime.js', () => ({
  getEphemeralCourseAgentSnapshot: mock.snapshot,
  respondToCourseAgentRender: mock.respond,
}));
vi.mock('./render-question.js', () => ({ renderCourseAgentQuestion: mock.render }));
vi.mock('@prairielearn/named-locks', () => ({
  doWithLock: (_name: string, _options: unknown, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../../../models/course-agent.js', () => ({ persistCourseAgentSnapshot: mock.persist }));

import { reconcileCourseAgentConversation } from './reconcile.js';

beforeEach(() => vi.resetAllMocks());

it('returns a render result through the trusted Worker boundary and skips completed requests', async () => {
  const identity = {
    conversationId: '7c7d78ce-5f84-4e94-a616-09fae056a5b2',
    sandboxId: 'sandbox',
    courseId: '1',
    userId: '2',
    runId: '17d94d08-eb5c-4e48-a2f6-8318e62b92e4',
  };
  const pendingRender = {
    id: 'fe3635bd-9ca1-4281-8159-d95d512a3a12',
    runId: identity.runId,
    qid: 'question',
    seed: '123',
    expiresAt: Date.now() + 180000,
    result: null,
  };
  const snapshot = CourseAgentSnapshotSchema.parse({
    ...identity,
    activeRunId: identity.runId,
    status: 'running',
    response: null,
    error: null,
    events: [],
    pendingRender,
  });
  const result = {
    success: true,
    qid: 'question',
    seed: '123',
    syncedRevision: 'abc',
    diagnostics: [],
  };
  mock.snapshot.mockResolvedValue(snapshot);
  mock.render.mockResolvedValue(result);
  await reconcileCourseAgentConversation(identity);
  expect(mock.respond).toHaveBeenCalledWith(identity, pendingRender.id, identity.runId, result);
  mock.render.mockClear();
  mock.snapshot.mockResolvedValue({ ...snapshot, pendingRender: { ...pendingRender, result } });
  await reconcileCourseAgentConversation(identity);
  expect(mock.render).not.toHaveBeenCalled();
  mock.persist.mockClear();
});

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
