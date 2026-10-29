import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { PendingReview } from '@prairielearn/course-agent-types';
import * as namedLocks from '@prairielearn/named-locks';
import * as postgres from '@prairielearn/postgres';

import type { AuditEvent, Course, CourseAgentConversation, Job } from '../../../lib/db-types.js';
import * as github from '../../../lib/github.js';
import * as jobs from '../../../lib/server-jobs.js';
import { type ServerJob, type ServerJobExecutor } from '../../../lib/server-jobs.js';
import * as auditEvents from '../../../models/audit-event.js';
import * as courses from '../../../models/course.js';
import * as sync from '../../../sync/syncFromDisk.js';

import * as client from './client.js';
import { getPendingReview, postReviewDecision } from './push-sync.js';
import * as diff from './review-diff.js';

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
  vi.clearAllMocks();
  vi.spyOn(namedLocks, 'doWithLock').mockImplementation(async (_name, _options, fn) => fn());
  vi.spyOn(postgres, 'runInTransactionAsync').mockImplementation(async (fn) =>
    fn({} as Parameters<typeof fn>[0]),
  );
  vi.spyOn(auditEvents, 'insertAuditEvent').mockResolvedValue({} as AuditEvent);
  vi.spyOn(courses, 'getLockNameForCoursePath').mockResolvedValue('course');
  vi.spyOn(courses, 'updateCourseCommitHash').mockResolvedValue(publishedCommit);
  vi.spyOn(diff, 'createReviewDiff').mockResolvedValue('reviewed diff');
  vi.spyOn(client, 'deliverCourseAgentReviewOutcome').mockResolvedValue();
  vi.spyOn(client, 'recordCourseAgentReviewDecision').mockResolvedValue();
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
  vi.spyOn(courses, 'selectCourseById').mockResolvedValue(course);
  vi.spyOn(client, 'getCourseAgentPendingReview').mockImplementation(async () => review);
  vi.spyOn(github, 'getGithubClient').mockReturnValue({
    repos: { getBranch },
    graphql,
  } as unknown as ReturnType<typeof github.getGithubClient>);
  getBranch.mockResolvedValue({ data: { commit: { sha: baseCommit } } });
  graphql.mockResolvedValue({ createCommitOnBranch: { commit: { oid: publishedCommit } } });
  vi.spyOn(sync, 'syncDiskToSqlWithLock').mockResolvedValue({
    status: 'complete',
    hadJsonErrors: false,
  } as Awaited<ReturnType<typeof sync.syncDiskToSqlWithLock>>);
  vi.spyOn(jobs, 'selectJobsByJobSequenceId').mockResolvedValue([{ id: 'job-1' } as Job]);
  // The job runner retains data even when job.fail() ends its callback.
  executeJob.mockImplementation(async (fn) => {
    await fn(job).catch(() => {});
    return { data: structuredClone(job.data) };
  });
  vi.spyOn(jobs, 'createServerJob').mockResolvedValue({
    jobSequenceId: 'job-1',
    execute: executeJob,
    executeUnsafe: vi.fn(),
    executeInBackground: vi.fn(),
  });
  reviewToken = (await getPendingReview(course, conversation, '2', review.callId))!.reviewToken;
});

afterEach(() => vi.restoreAllMocks());

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

it('approval publishes the saved files and delivers the published commit after sync', async () => {
  await expect(decide('approved')).resolves.toEqual({
    decision: 'approved',
    jobSequenceId: 'job-1',
  });
  await executeJob.mock.results[0].value;
  expect(graphql).toHaveBeenCalledWith(expect.any(String), {
    input: {
      branch: { repositoryNameWithOwner: 'PrairieLearn/course', branchName: 'master' },
      expectedHeadOid: baseCommit,
      message: { headline: 'Apply reviewed course agent edits' },
      fileChanges: { additions: review.snapshot.additions, deletions: review.snapshot.deletions },
    },
  });
  expect(sync.syncDiskToSqlWithLock).toHaveBeenCalledOnce();
  expect(client.deliverCourseAgentReviewOutcome).toHaveBeenCalledWith('agent-1', {
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
  expect(client.recordCourseAgentReviewDecision).toHaveBeenCalledWith('agent-1', {
    callId: 'review-1',
    decision: 'denied',
  });
  expect(client.deliverCourseAgentReviewOutcome).toHaveBeenCalledWith('agent-1', {
    callId: 'review-1',
    result: {
      decision: 'denied',
      publication: { status: 'not_attempted' },
      sync: { status: 'not_attempted' },
    },
  });
  expect(jobs.createServerJob).not.toHaveBeenCalled();
  expect(graphql).not.toHaveBeenCalled();
  expect(sync.syncDiskToSqlWithLock).not.toHaveBeenCalled();
});

it('a repeated approval reuses its job and a conflicting denial is rejected', async () => {
  review = { ...review, status: 'running', jobSequenceId: 'existing-job' };
  await expect(decide('approved')).resolves.toEqual({
    decision: 'approved',
    jobSequenceId: 'existing-job',
  });
  await expect(decide('denied')).rejects.toThrow('already has a different decision');
  expect(jobs.createServerJob).not.toHaveBeenCalled();
  expect(client.recordCourseAgentReviewDecision).not.toHaveBeenCalled();
});

it('an approval for a replaced review cannot start publication', async () => {
  review = { ...review, callId: 'new-review' };
  await expect(decide('approved')).rejects.toThrow('This review has changed');
  expect(jobs.createServerJob).not.toHaveBeenCalled();
  expect(graphql).not.toHaveBeenCalled();
});

it('an advanced branch head rejects publication and skips sync', async () => {
  getBranch.mockResolvedValue({ data: { commit: { sha: 'c'.repeat(40) } } });
  await decide('approved');
  await executeJob.mock.results[0].value;
  expect(graphql).not.toHaveBeenCalled();
  expect(sync.syncDiskToSqlWithLock).not.toHaveBeenCalled();
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
  expect(sync.syncDiskToSqlWithLock).not.toHaveBeenCalled();
  expect(client.deliverCourseAgentReviewOutcome).not.toHaveBeenCalled();
  expect(graphql).toHaveBeenCalledOnce();
});

it('sync failure retains the published commit and returns its diagnostics', async () => {
  vi.spyOn(sync, 'syncDiskToSqlWithLock').mockRejectedValue(
    new Error('Invalid question configuration'),
  );
  await decide('approved');
  await executeJob.mock.results[0].value;
  expect(client.deliverCourseAgentReviewOutcome).toHaveBeenCalledWith('agent-1', {
    callId: 'review-1',
    result: {
      decision: 'approved',
      publication: { status: 'published', commitSha: publishedCommit },
      sync: { status: 'failed', error: 'Invalid question configuration' },
    },
  });
});

it('failed outcome delivery leaves the completed job result available without republishing', async () => {
  vi.mocked(client.deliverCourseAgentReviewOutcome).mockImplementation(
    async (_agentId, outcome) => {
      expect(job.data.result).toEqual(outcome.result);
      throw new Error('Agent unavailable');
    },
  );
  await decide('approved');
  const saved = await executeJob.mock.results[0].value;
  expect(saved.data.result).toEqual({
    decision: 'approved',
    publication: { status: 'published', commitSha: publishedCommit },
    sync: { status: 'succeeded' },
  });
  expect(client.deliverCourseAgentReviewOutcome).toHaveBeenCalledOnce();
  expect(graphql).toHaveBeenCalledOnce();
});
