import { beforeEach, expect, it, vi } from 'vitest';

import type { PendingReview } from '@prairielearn/course-agent-types';

import type { Course, CourseAgentConversation, Job } from '../../../lib/db-types.js';
import {
  type ServerJob,
  type ServerJobExecutor,
  createServerJob,
  selectJobsByJobSequenceId,
} from '../../../lib/server-jobs.js';
import { selectCourseById } from '../../../models/course.js';
import { withConfig } from '../../../tests/utils/config.js';

import {
  deliverCourseAgentReviewOutcome,
  getCourseAgentPendingReview,
  recordCourseAgentReviewDecision,
} from './client.js';
import { getPendingReview, postReviewDecision } from './push-sync.js';
import { ReviewedChangesEditor } from './reviewed-changes-editor.js';

// Other suites can load the real dependencies because Vitest disables module isolation.
vi.hoisted(() => vi.resetModules());

vi.mock('@prairielearn/named-locks', () => ({
  doWithLock: async (_name: string, _options: unknown, fn: () => Promise<void>) => fn(),
}));
vi.mock('@prairielearn/postgres', () => ({
  runInTransactionAsync: async (fn: () => Promise<unknown>) => fn(),
}));
const { executeEditor } = vi.hoisted(() => ({
  executeEditor: vi.fn<ReviewedChangesEditor['executeWithJob']>(),
}));
vi.mock('./reviewed-changes-editor.js', () => ({
  ReviewedChangesEditor: vi.fn(
    class {
      executeWithJob = executeEditor;
    },
  ),
}));
vi.mock('../../../lib/server-jobs.js', () => ({
  createServerJob: vi.fn(),
  selectJobsByJobSequenceId: vi.fn(),
}));
vi.mock('../../../models/audit-event.js', () => ({ insertAuditEvent: vi.fn() }));
vi.mock('../../../models/course.js', () => ({
  selectCourseById: vi.fn(),
  getLockNameForCoursePath: vi.fn(),
  updateCourseCommitHash: vi.fn(),
}));
vi.mock('./client.js', () => ({
  getCourseAgentPendingReview: vi.fn(),
  recordCourseAgentReviewDecision: vi.fn(),
  deliverCourseAgentReviewOutcome: vi.fn(),
}));
vi.mock('./review-diff.js', () => ({ createReviewDiff: vi.fn(async () => 'reviewed diff') }));

const baseCommit = 'a'.repeat(40);
const publishedCommit = 'b'.repeat(40);
const course = {
  id: '1',
  repository: 'https://github.com/PrairieLearn/course.git',
  branch: 'master',
  path: '/tmp/course-agent-unit-test',
} as Course;
const conversation: CourseAgentConversation = {
  id: '1',
  course_id: '1',
  user_id: '2',
  agent_conversation_id: 'agent-1',
  title: 'Update question',
  created_at: new Date(0),
};
const job: ServerJob = {
  data: {},
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  verbose: vi.fn(),
  exec: vi.fn(),
  fail: (message) => {
    throw new Error(message);
  },
  stop: (message) => {
    throw new Error(message);
  },
};
const executeJob = vi.fn<ServerJobExecutor['execute']>();
let review: PendingReview;

beforeEach(() => {
  vi.resetAllMocks();
  job.data = {};
  review = {
    callId: 'review-1',
    card: { messageId: 'assistant-1', partId: 'review-1' },
    status: 'pending',
    jobSequenceId: null,
    error: null,
    snapshot: {
      type: 'github',
      repository: 'PrairieLearn/course',
      branch: 'master',
      baseCommit,
      additions: [{ path: 'question.html', contents: 'cmV2aWV3ZWQ=' }],
      deletions: [{ path: 'old.html' }],
    },
  };
  vi.mocked(selectCourseById).mockResolvedValue(course);
  vi.mocked(getCourseAgentPendingReview).mockImplementation(async () => review);
  executeEditor.mockImplementation(async (editorJob) => {
    editorJob.data.saveSucceeded = true;
    editorJob.data.commitHash = publishedCommit;
    editorJob.data.syncSucceeded = true;
  });
  vi.mocked(selectJobsByJobSequenceId).mockResolvedValue([{ id: 'job-1' } as Job]);
  // The job runner retains data even when job.fail() ends its callback.
  executeJob.mockImplementation(async (fn) => {
    await fn(job).catch(() => {});
    return { data: structuredClone(job.data) };
  });
  vi.mocked(createServerJob).mockResolvedValue({
    jobSequenceId: 'job-1',
    execute: executeJob,
    executeUnsafe: vi.fn(),
    executeInBackground: vi.fn(),
  });
});

async function decide(decision: 'approved' | 'denied') {
  const pending = await getPendingReview(course, conversation, '2', review.callId);
  return postReviewDecision({
    course,
    conversation,
    user: {
      id: '2',
      name: 'Instructor',
      email: 'instructor@example.com',
      uid: 'instructor@example.com',
    },
    authzData: {
      has_course_permission_edit: true,
      authn_user: { id: '2' },
    },
    authnUserId: '2',
    reviewToken: pending!.reviewToken,
    decision,
  });
}

const modes = [
  {
    type: 'github',
    publication: { status: 'published', commitSha: publishedCommit },
  },
  { type: 'local', publication: { status: 'saved_locally' } },
] as const;

function setLocalSnapshot() {
  review.snapshot = {
    type: 'local',
    additions: review.snapshot.additions,
    deletions: review.snapshot.deletions,
    originals: [
      { path: 'question.html', contents: 'b3JpZ2luYWw=' },
      { path: 'old.html', contents: 'ZGVsZXRlIG1l' },
    ],
  };
}

it.each(modes)(
  'approves the $type snapshot and delivers the saved result',
  async ({ type, publication }) => {
    await withConfig({ devMode: true, fileEditorUseGit: type === 'github' }, async () => {
      if (type === 'local') setLocalSnapshot();
      await expect(decide('approved')).resolves.toEqual({
        decision: 'approved',
        jobSequenceId: 'job-1',
      });
      await vi.waitFor(() => expect(deliverCourseAgentReviewOutcome).toHaveBeenCalledOnce());
      expect(ReviewedChangesEditor).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ course, snapshot: review.snapshot }),
      );
      expect(executeEditor).toHaveBeenCalledOnce();
      const result = {
        decision: 'approved',
        publication,
        sync: { status: 'succeeded' },
      };
      const saved = await executeJob.mock.results[0].value;
      expect(saved.data.result).toEqual(result);
      expect(deliverCourseAgentReviewOutcome).toHaveBeenCalledWith('agent-1', {
        callId: review.callId,
        result,
      });
    });
  },
);

it('denial delivers the decision without creating a publication job or syncing', async () => {
  await expect(decide('denied')).resolves.toEqual({ decision: 'denied', jobSequenceId: null });
  expect(recordCourseAgentReviewDecision).toHaveBeenCalledWith('agent-1', {
    callId: 'review-1',
    decision: 'denied',
  });
  expect(deliverCourseAgentReviewOutcome).toHaveBeenCalledWith('agent-1', {
    callId: 'review-1',
    result: {
      decision: 'denied',
      publication: { status: 'not_attempted' },
      sync: { status: 'not_attempted' },
    },
  });
  expect(createServerJob).not.toHaveBeenCalled();
  expect(executeEditor).not.toHaveBeenCalled();
});

it.each(modes)(
  'reports the $type save when sync fails afterward',
  async ({ type, publication }) => {
    await withConfig({ devMode: true, fileEditorUseGit: type === 'github' }, async () => {
      if (type === 'local') setLocalSnapshot();
      executeEditor.mockImplementation(async (editorJob) => {
        editorJob.data.saveSucceeded = true;
        if (type === 'github') editorJob.data.commitHash = publishedCommit;
        editorJob.error('Question questions/example: invalid configuration');
        throw new Error('Invalid question configuration');
      });
      await decide('approved');
      await vi.waitFor(() => expect(deliverCourseAgentReviewOutcome).toHaveBeenCalledOnce());
      expect(deliverCourseAgentReviewOutcome).toHaveBeenCalledWith('agent-1', {
        callId: review.callId,
        result: {
          decision: 'approved',
          publication,
          sync: {
            status: 'failed',
            error:
              'Question questions/example: invalid configuration\nInvalid question configuration',
          },
        },
      });
    });
  },
);
