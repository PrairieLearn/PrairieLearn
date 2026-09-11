import { beforeEach, expect, it, vi } from 'vitest';

import type { CourseAgentPushApproval as WorkerApproval } from '@prairielearn/course-agent-protocol';

import type { Course, CourseAgentPushApproval } from '../../../lib/db-types.js';

const mock = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  jobs: vi.fn(),
  respond: vi.fn(),
  execute: vi.fn(),
}));
vi.mock('@prairielearn/named-locks', () => ({
  doWithLock: (_name: string, _options: unknown, callback: () => unknown) => callback(),
}));
vi.mock('execa', () => ({ execa: mock.execute }));
vi.mock('../../../models/course-agent.js', () => ({
  selectOptionalCourseAgentPushApproval: mock.select,
  updateCourseAgentPushApproval: mock.update,
  upsertCourseAgentPushApproval: vi.fn(),
}));
vi.mock('../../../lib/server-jobs.js', () => ({ selectJobsByJobSequenceId: mock.jobs }));
vi.mock('./ephemeral-runtime.js', () => ({ respondToCourseAgentPushApproval: mock.respond }));

import { reconcileCourseAgentPushApproval } from './publication.js';

const options = {
  proposal: { id: 'approval' } as WorkerApproval,
  course: { id: '1' } as Course,
  conversationId: 'conversation',
  sandboxId: 'sandbox',
  runId: 'run',
  userId: '1',
};
let approval: CourseAgentPushApproval;

beforeEach(() => {
  vi.resetAllMocks();
  approval = {
    base_sha: 'a'.repeat(40),
    branch: 'master',
    commit_message: 'Update question',
    completed_at: null,
    conversation_id: options.conversationId,
    course_id: options.course.id,
    created_at: new Date(Date.now() - 900_000),
    diff: 'patch',
    diff_summary: 'one file',
    id: 'approval',
    proposed_sha: 'b'.repeat(40),
    repository: 'https://github.com/PrairieLearn/test.git',
    requested_by: options.userId,
    run_id: options.runId,
    status: 'publishing',
    result: { jobSequenceId: '1' },
    decided_at: new Date(Date.now() - 600_000),
    decided_by: '1',
  };
  mock.select.mockImplementation(async () => approval);
  mock.update.mockImplementation(async ({ status, result }) => {
    approval = { ...approval, status, result };
    return approval;
  });
});

it('reports sync in progress without finishing or restarting the publication job', async () => {
  mock.jobs.mockResolvedValue([{ status: 'Running', data: { saveSucceeded: true } }]);
  await reconcileCourseAgentPushApproval(options);
  expect(mock.respond).toHaveBeenCalledWith(
    expect.objectContaining({ decision: 'publishing', phase: 'syncing' }),
  );
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.execute).not.toHaveBeenCalled();
});

it.each([
  { data: { saveSucceeded: true, syncSucceeded: true }, status: 'completed', published: true },
  { data: { saveSucceeded: true, syncSucceeded: false }, status: 'failed', published: true },
  { data: {}, status: 'failed', published: false },
])(
  'recovers a terminal job as $status without pushing again',
  async ({ data, status, published }) => {
    mock.jobs.mockResolvedValue([{ status: 'Stopped', data, output: 'Saved job output' }]);
    await reconcileCourseAgentPushApproval(options);
    await reconcileCourseAgentPushApproval(options);
    expect(mock.update).toHaveBeenCalledOnce();
    expect(mock.respond).toHaveBeenLastCalledWith(
      expect.objectContaining({
        decision: status,
        result: expect.objectContaining({ published, publicationUnknown: !published }),
      }),
    );
    expect(mock.execute).not.toHaveBeenCalled();
  },
);

it('expires a publication that never recorded a job without starting a push', async () => {
  approval.result = null;
  await reconcileCourseAgentPushApproval(options);
  expect(mock.respond).toHaveBeenCalledWith(
    expect.objectContaining({
      decision: 'failed',
      result: expect.objectContaining({ published: false }),
    }),
  );
  expect(mock.jobs).not.toHaveBeenCalled();
  expect(mock.execute).not.toHaveBeenCalled();
});

it('acknowledges validated approval while waiting for the instructor', async () => {
  approval.status = 'pending';
  approval.result = null;
  await reconcileCourseAgentPushApproval(options);
  expect(mock.respond).toHaveBeenCalledWith(expect.objectContaining({ decision: 'pending' }));
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.execute).not.toHaveBeenCalled();
});
