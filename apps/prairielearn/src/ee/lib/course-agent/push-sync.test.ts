import { beforeEach, expect, it, vi } from 'vitest';

import type { PendingReview } from '@prairielearn/course-agent-types';

import type { Course, CourseAgentConversation, Job } from '../../../lib/db-types.js';
import { getGithubClient } from '../../../lib/github.js';
import {
  type ServerJob,
  type ServerJobExecutor,
  createServerJob,
  selectJobsByJobSequenceId,
} from '../../../lib/server-jobs.js';
import { selectCourseById } from '../../../models/course.js';
import { syncDiskToSqlWithLock } from '../../../sync/syncFromDisk.js';

import {
  deliverCourseAgentReviewOutcome,
  getCourseAgentPendingReview,
  recordCourseAgentReviewDecision,
} from './client.js';
import { getPendingReview, postReviewDecision } from './push-sync.js';

// Other suites can load the real dependencies because Vitest disables module isolation.
vi.hoisted(() => vi.resetModules());

vi.mock('@prairielearn/named-locks', () => ({
  doWithLock: async (_name: string, _options: unknown, fn: () => Promise<void>) => fn(),
}));
vi.mock('@prairielearn/postgres', () => ({
  runInTransactionAsync: async (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../../../lib/github.js', () => ({ getGithubClient: vi.fn() }));
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
vi.mock('../../../sync/syncFromDisk.js', () => ({ syncDiskToSqlWithLock: vi.fn() }));
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
  usage_input_tokens: 0,
  usage_input_tokens_cache_read: 0,
  usage_output_tokens: 0,
  usage_output_tokens_reasoning: 0,
  usage_cost_milli_dollars: 0,
  usage_report_sequence: 0,
};
const graphql = vi.fn();
const getBranch = vi.fn();
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
let reviewToken: string;

beforeEach(async () => {
  vi.resetAllMocks();
  job.data = {};
  review = {
    callId: 'review-1',
    card: { messageId: 'assistant-1', partId: 'review-1' },
    status: 'pending',
    jobSequenceId: null,
    error: null,
    snapshot: {
      repository: 'PrairieLearn/course',
      branch: 'master',
      baseCommit,
      additions: [{ path: 'question.html', contents: 'cmV2aWV3ZWQ=' }],
      deletions: [{ path: 'old.html' }],
    },
  };
  vi.mocked(selectCourseById).mockResolvedValue(course);
  vi.mocked(getCourseAgentPendingReview).mockImplementation(async () => review);
  vi.mocked(getGithubClient).mockReturnValue({
    repos: { getBranch },
    graphql,
  } as unknown as ReturnType<typeof getGithubClient>);
  getBranch.mockResolvedValue({ data: { commit: { sha: baseCommit } } });
  graphql.mockResolvedValue({ createCommitOnBranch: { commit: { oid: publishedCommit } } });
  vi.mocked(syncDiskToSqlWithLock).mockResolvedValue({
    status: 'complete',
    hadJsonErrors: false,
  } as Awaited<ReturnType<typeof syncDiskToSqlWithLock>>);
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
  reviewToken = (await getPendingReview(course, conversation, '2', review.callId))!.reviewToken;
});

function decide(decision: 'approved' | 'denied') {
  return postReviewDecision({
    course,
    conversation,
    user: { id: '2' },
    authnUserId: '2',
    reviewToken,
    decision,
  });
}

it('approval publishes reviewed files, syncs, and saves the result even if delivery fails', async () => {
  vi.mocked(deliverCourseAgentReviewOutcome).mockImplementation(async (_agentId, outcome) => {
    expect(job.data.result).toEqual(outcome.result);
    throw new Error('Agent unavailable');
  });
  await expect(decide('approved')).resolves.toEqual({
    decision: 'approved',
    jobSequenceId: 'job-1',
  });
  const saved = await executeJob.mock.results[0].value;
  expect(saved.data.result).toEqual({
    decision: 'approved',
    publication: { status: 'published', commitSha: publishedCommit },
    sync: { status: 'succeeded' },
  });
  expect(graphql).toHaveBeenCalledExactlyOnceWith(expect.any(String), {
    input: {
      branch: { repositoryNameWithOwner: 'PrairieLearn/course', branchName: 'master' },
      expectedHeadOid: baseCommit,
      message: { headline: 'Apply reviewed course agent edits' },
      fileChanges: { additions: review.snapshot.additions, deletions: review.snapshot.deletions },
    },
  });
  expect(syncDiskToSqlWithLock).toHaveBeenCalledOnce();
  expect(deliverCourseAgentReviewOutcome).toHaveBeenCalledWith('agent-1', {
    callId: 'review-1',
    result: {
      decision: 'approved',
      publication: { status: 'published', commitSha: publishedCommit },
      sync: { status: 'succeeded' },
    },
  });
});

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
  expect(graphql).not.toHaveBeenCalled();
  expect(syncDiskToSqlWithLock).not.toHaveBeenCalled();
});

it('a repeated approval reuses its job and a conflicting denial is rejected', async () => {
  review = { ...review, status: 'running', jobSequenceId: 'existing-job' };
  await expect(decide('approved')).resolves.toEqual({
    decision: 'approved',
    jobSequenceId: 'existing-job',
  });
  await expect(decide('denied')).rejects.toThrow('already has a different decision');
  expect(createServerJob).not.toHaveBeenCalled();
  expect(recordCourseAgentReviewDecision).not.toHaveBeenCalled();
});

it('an advanced branch head rejects publication and skips sync', async () => {
  getBranch.mockResolvedValue({ data: { commit: { sha: 'c'.repeat(40) } } });
  await decide('approved');
  await executeJob.mock.results[0].value;
  expect(graphql).not.toHaveBeenCalled();
  expect(syncDiskToSqlWithLock).not.toHaveBeenCalled();
  expect(job.data.result).toMatchObject({
    publication: { status: 'failed' },
    sync: { status: 'not_attempted' },
  });
});

it('an uncertain publication failure blocks delivery and never starts sync', async () => {
  graphql.mockRejectedValue(new Error('GitHub connection lost'));
  await decide('approved');
  const saved = await executeJob.mock.results[0].value;
  expect(saved.data.error).toContain('GitHub publication could not be confirmed');
  expect(saved.data.result).toBeUndefined();
  expect(syncDiskToSqlWithLock).not.toHaveBeenCalled();
  expect(deliverCourseAgentReviewOutcome).not.toHaveBeenCalled();
  expect(graphql).toHaveBeenCalledOnce();
});

it('sync failure retains the published commit and returns its diagnostics', async () => {
  vi.mocked(syncDiskToSqlWithLock).mockRejectedValue(new Error('Invalid question configuration'));
  await decide('approved');
  await executeJob.mock.results[0].value;
  expect(deliverCourseAgentReviewOutcome).toHaveBeenCalledWith('agent-1', {
    callId: 'review-1',
    result: {
      decision: 'approved',
      publication: { status: 'published', commitSha: publishedCommit },
      sync: { status: 'failed', error: 'Invalid question configuration' },
    },
  });
});
