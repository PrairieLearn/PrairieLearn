import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import type { Review } from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import { execute } from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

import type { Course, CourseAgentConversation, User } from '../../../lib/db-types.js';
import { FileDeleteEditor, FileUploadEditor, type MultiEditor } from '../../../lib/editors.js';
import { createServerJob, getJobSequence } from '../../../lib/server-jobs.js';
import type { JobSequenceWithTokens } from '../../../lib/server-jobs.types.js';
import { selectCourseById, updateCourseColumn } from '../../../models/course.js';
import * as helperCourse from '../../../tests/helperCourse.js';
import * as helperDb from '../../../tests/helperDb.js';
import { getOrCreateUser } from '../../../tests/utils/auth.js';
import { withConfig } from '../../../tests/utils/config.js';
import { insertCourseAgentConversation } from '../../models/course-agent-conversation.js';
import {
  insertCourseAgentReview,
  selectOptionalCourseAgentReview,
  selectUndeliveredCourseAgentReviews,
} from '../../models/course-agent-review.js';

import {
  deliverUndeliveredReviewResults,
  getReview,
  getReviewJobResult,
  postReviewDecision,
  resumeConversation,
} from './apply-changes.js';
import {
  deliverCourseAgentReviewResult,
  getCourseAgentReview,
  resumeCourseAgentConversation,
} from './client.js';
import { createReviewDiff } from './review-diff.js';

// Other suites can load the real dependencies because Vitest disables module isolation.
vi.hoisted(() => vi.resetModules());

const { executeEditor, prepareJob } = vi.hoisted(() => ({
  executeEditor: vi.fn<MultiEditor['executeWithServerJob']>(),
  prepareJob: vi.fn<MultiEditor['prepareServerJob']>(),
}));
vi.mock('../../../lib/editors.js', () => ({
  FileUploadEditor: vi.fn(function () {}),
  FileDeleteEditor: vi.fn(function () {}),
  MultiEditor: vi.fn(
    class {
      prepareServerJob = prepareJob;
      executeWithServerJob = executeEditor;
    },
  ),
}));
vi.mock(import('../../../lib/server-jobs.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  getJobSequence: vi.fn(),
}));
vi.mock('./client.js', () => ({
  getCourseAgentReview: vi.fn(),
  deliverCourseAgentReviewResult: vi.fn(),
  resumeCourseAgentConversation: vi.fn(),
}));
vi.mock('./review-diff.js', () => ({ createReviewDiff: vi.fn(async () => []) }));

const PUBLISHED = {
  decision: 'approved',
  publication: { status: 'published' },
  sync: { status: 'succeeded' },
} as const;
let course: Course;
let user: User;
let conversation: CourseAgentConversation;
let jobSequenceId: string;
let sequence: JobSequenceWithTokens;
let review: Review;

beforeAll(async () => {
  await helperDb.before();
  await helperCourse.syncCourse();
  for (const [columnName, value] of [
    ['repository', 'https://github.com/PrairieLearn/course.git'],
    ['branch', 'master'],
  ] as const) {
    await updateCourseColumn({ courseId: '1', columnName, value, authnUserId: '1' });
  }
  course = await selectCourseById('1');
  user = await getOrCreateUser({ uid: 'agent-owner@example.com', name: 'Owner', uin: 'owner' });
  conversation = await insertCourseAgentConversation({
    course_id: '1',
    user_id: user.id,
    agent_conversation_id: crypto.randomUUID(),
    title: 'Update question',
  });
  const serverJob = await createServerJob({
    type: 'sync',
    description: 'Save reviewed course edits',
    courseId: '1',
    userId: user.id,
    authnUserId: user.id,
  });
  // A created job stays registered until it runs, and later test servers sharing this worker
  // wait for every registered job when they shut down.
  await serverJob.execute(async () => {});
  jobSequenceId = serverJob.jobSequenceId;
});
afterAll(helperDb.after);

beforeEach(() => {
  vi.resetAllMocks();
  sequence = {
    id: jobSequenceId,
    type: 'sync',
    authn_user_id: user.id,
    jobs: [{ data: {}, status: 'Success', output: '', error_message: null }],
  } as JobSequenceWithTokens;
  // Each test uses a fresh review ID, so recorded decisions never collide.
  review = {
    id: crypto.randomUUID(),
    snapshot: {
      type: 'github',
      repository: 'PrairieLearn/course',
      branch: 'master',
      baseCommit: 'a'.repeat(40),
      additions: [{ path: 'question.html', contents: 'cmV2aWV3ZWQ=' }],
      deletions: [{ path: 'old.html' }],
    },
  };
  vi.mocked(getCourseAgentReview).mockImplementation(async (_, id) =>
    id === review.id ? review : null,
  );
  executeEditor.mockImplementation(async () => {
    sequence.jobs[0].data = { saveSucceeded: true, syncSucceeded: true };
  });
  vi.mocked(getJobSequence).mockResolvedValue(sequence);
  prepareJob.mockResolvedValue({
    jobSequenceId: sequence.id,
    execute: vi.fn(),
    executeUnsafe: vi.fn(),
    executeInBackground: vi.fn(),
  });
});

// Approvals save in the background. Let each settle before the next test resets the mocks, and
// before the database is torn down.
afterEach(async () => {
  await vi.waitFor(async () => {
    const rows = await selectUndeliveredCourseAgentReviews({
      course_agent_conversation_id: conversation.id,
    });
    if (rows.length > 0) throw new Error('A background save has not settled');
  });
});

function decide(decision: 'approved' | 'denied', reviewId = review.id) {
  return postReviewDecision({
    course,
    conversation,
    user,
    authzData: { has_course_permission_edit: true, authn_user: { id: user.id } },
    reviewId,
    decision,
  });
}

function withService<T>(fn: () => Promise<T>) {
  return withConfig({ courseAgentServiceUrl: 'http://agent.test' }, fn);
}

function storedReview() {
  return selectOptionalCourseAgentReview({
    course_agent_conversation_id: conversation.id,
    agent_review_id: review.id,
  });
}

const modes = [
  { type: 'github', publication: { status: 'published' } },
  { type: 'local', publication: { status: 'saved_locally' } },
] as const;

it.each(modes)('saves an approved $type snapshot and delivers its result', async (mode) => {
  await withConfig({ devMode: true, fileEditorUseGit: mode.type === 'github' }, async () => {
    if (mode.type === 'local') {
      const { additions, deletions } = review.snapshot;
      review.snapshot = { type: 'local', additions, deletions };
    }
    await expect(decide('approved')).resolves.toEqual({ decision: 'approved' });
    await vi.waitFor(async () => expect((await storedReview())?.result_delivered_at).toBeTruthy());
    expect(FileUploadEditor).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        files: { [path.join(course.path, 'question.html')]: Buffer.from('reviewed') },
      }),
    );
    expect(FileDeleteEditor).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ deletePath: path.join(course.path, 'old.html') }),
    );
    const result = { decision: 'approved', publication: mode.publication, sync: PUBLISHED.sync };
    expect(deliverCourseAgentReviewResult).toHaveBeenCalledExactlyOnceWith(
      conversation.agent_conversation_id,
      review.id,
      result,
    );
    expect(await getReview(course, conversation, review.id)).toEqual({
      status: 'decided',
      result,
    });
  });
});

it('denies an unreadable review without starting a save job', async () => {
  vi.mocked(createReviewDiff).mockRejectedValue(new HttpStatusError(400, 'Missing review base'));
  await withConfig({ fileEditorUseGit: true }, async () => {
    expect(await getReview(course, conversation, review.id)).toEqual({
      status: 'pending',
      diff: { files: null, error: 'Missing review base' },
    });
  });
  await expect(decide('denied')).resolves.toEqual({ decision: 'denied' });
  expect(deliverCourseAgentReviewResult).toHaveBeenCalledExactlyOnceWith(
    conversation.agent_conversation_id,
    review.id,
    {
      decision: 'denied',
      publication: { status: 'not_attempted' },
      sync: { status: 'not_attempted' },
    },
  );
  expect(prepareJob).not.toHaveBeenCalled();
});

it('keeps the first decision and refuses a different one', async () => {
  await withConfig({ fileEditorUseGit: true }, async () => {
    await decide('approved');
    await expect(decide('approved')).resolves.toEqual({ decision: 'approved' });
    await expect(decide('denied')).rejects.toThrow('already has a different decision');
    expect(prepareJob).toHaveBeenCalledOnce();
  });
});

it('refuses a decision for a review the agent no longer has', async () => {
  await expect(decide('approved', crypto.randomUUID())).rejects.toThrow('no longer pending');
  expect(prepareJob).not.toHaveBeenCalled();
});

it('reports a save whose sync failed afterward', async () => {
  executeEditor.mockImplementation(async () => {
    sequence.jobs[0].data = { saveSucceeded: true };
    sequence.jobs[0].status = 'Error';
    sequence.jobs[0].output = 'Invalid question configuration';
    throw new Error('Invalid question configuration');
  });
  await withConfig({ fileEditorUseGit: true }, () => decide('approved'));
  await vi.waitFor(() => expect(deliverCourseAgentReviewResult).toHaveBeenCalledOnce());
  expect(vi.mocked(deliverCourseAgentReviewResult).mock.calls[0][2]).toEqual({
    decision: 'approved',
    publication: { status: 'published' },
    sync: { status: 'failed', error: 'Invalid question configuration' },
  });
});

it('retries a result the agent service did not acknowledge', async () => {
  vi.mocked(deliverCourseAgentReviewResult).mockRejectedValueOnce(new Error('Service unavailable'));
  await decide('denied');
  expect((await storedReview())?.result_delivered_at).toBeNull();
  await withService(deliverUndeliveredReviewResults);
  expect(deliverCourseAgentReviewResult).toHaveBeenCalledTimes(2);
  expect((await storedReview())?.result_delivered_at).toBeTruthy();
});

it('reports a stuck result once and stops resending it after the cutoff', async () => {
  const captured = vi.spyOn(Sentry, 'captureException');
  vi.mocked(deliverCourseAgentReviewResult).mockRejectedValue(new Error('Service unavailable'));
  const age = (interval: string) =>
    execute(
      'UPDATE course_agent_reviews SET created_at = now() - $interval::interval WHERE agent_review_id = $agent_review_id',
      { interval, agent_review_id: review.id },
    );
  await decide('denied');
  await withService(deliverUndeliveredReviewResults);
  expect(captured).not.toHaveBeenCalled();
  await age('2 hours');
  await withService(deliverUndeliveredReviewResults);
  await withService(deliverUndeliveredReviewResults);
  expect(captured).toHaveBeenCalledOnce();
  expect(deliverCourseAgentReviewResult).toHaveBeenCalledTimes(4);
  await age('8 days');
  await withService(deliverUndeliveredReviewResults);
  expect(deliverCourseAgentReviewResult).toHaveBeenCalledTimes(4);
  expect((await storedReview())?.delivery_expired_at).toBeTruthy();
  // Resume still sends an expired result, so a conversation can be unstuck by hand.
  vi.mocked(deliverCourseAgentReviewResult).mockResolvedValue(undefined);
  vi.mocked(resumeCourseAgentConversation).mockResolvedValue({ recovered: true });
  await withService(() => resumeConversation(conversation));
  expect(deliverCourseAgentReviewResult).toHaveBeenCalledTimes(5);
  expect((await storedReview())?.result_delivered_at).toBeTruthy();
});

it('rebuilds a result from a finished job when the saving process stopped', async () => {
  // An approval whose PrairieLearn process stopped after the job finished but before recording.
  await insertCourseAgentReview({
    course_agent_conversation_id: conversation.id,
    agent_review_id: review.id,
    decision: 'approved',
    job_sequence_id: sequence.id,
    result: null,
  });
  sequence.jobs[0].status = 'Running';
  await withService(deliverUndeliveredReviewResults);
  expect(deliverCourseAgentReviewResult).not.toHaveBeenCalled();
  sequence.jobs[0] = {
    ...sequence.jobs[0],
    status: 'Success',
    data: { saveSucceeded: true, syncSucceeded: true },
  };
  await withService(deliverUndeliveredReviewResults);
  expect(deliverCourseAgentReviewResult).toHaveBeenCalledExactlyOnceWith(
    conversation.agent_conversation_id,
    review.id,
    PUBLISHED,
  );
  expect(await storedReview()).toMatchObject({ result: PUBLISHED });
});

it('sends unacknowledged results before resuming the agent', async () => {
  vi.mocked(deliverCourseAgentReviewResult).mockRejectedValueOnce(new Error('Service unavailable'));
  vi.mocked(resumeCourseAgentConversation).mockResolvedValue({ recovered: true });
  await decide('denied');
  await expect(withService(() => resumeConversation(conversation))).resolves.toEqual({
    recovered: true,
  });
  expect(deliverCourseAgentReviewResult).toHaveBeenCalledTimes(2);
  expect(vi.mocked(deliverCourseAgentReviewResult).mock.invocationCallOrder[1]).toBeLessThan(
    vi.mocked(resumeCourseAgentConversation).mock.invocationCallOrder[0],
  );
});

it('settles a review whose save job was stopped before writing', () => {
  sequence.jobs[0] = { ...sequence.jobs[0], status: 'Stopped', output: 'Stopped by user' };
  expect(getReviewJobResult(sequence, 'github')).toEqual({
    decision: 'approved',
    publication: { status: 'failed', error: 'Stopped by user' },
    sync: { status: 'not_attempted' },
  });
});

it('reports an unknown outcome for a save job the abandoned-job sweeper ended', () => {
  // errorAbandonedJobs records an error message and leaves the flags the job held in memory unsaved.
  sequence.jobs[0] = {
    ...sequence.jobs[0],
    status: 'Error',
    output: null,
    error_message: 'Job abandoned by server',
  };
  expect(getReviewJobResult(sequence, 'github')).toEqual({
    decision: 'approved',
    publication: { status: 'unknown' },
    sync: { status: 'unknown' },
  });
});
