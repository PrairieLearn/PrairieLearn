import { beforeEach, expect, it, vi } from 'vitest';

import type { PendingReview } from '@prairielearn/course-agent-types';

import type { Course, CourseAgentConversation, User } from '../../../lib/db-types.js';
import { FileDeleteEditor, FileUploadEditor, MultiEditor } from '../../../lib/editors.js';
import { getJobSequence } from '../../../lib/server-jobs.js';
import type { JobSequenceWithTokens } from '../../../lib/server-jobs.types.js';
import { selectCourseById } from '../../../models/course.js';
import { withConfig } from '../../../tests/utils/config.js';

import { getReviewJobOutcome, postReviewDecision } from './apply-changes.js';
import {
  deliverCourseAgentReviewOutcome,
  getCourseAgentPendingReview,
  recordCourseAgentReviewDecision,
} from './client.js';

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
vi.mock('../../../lib/server-jobs.js', () => ({ getJobSequence: vi.fn() }));
vi.mock('../../../models/course.js', () => ({ selectCourseById: vi.fn() }));
vi.mock('./client.js', () => ({
  getCourseAgentPendingReview: vi.fn(),
  recordCourseAgentReviewDecision: vi.fn(),
  deliverCourseAgentReviewOutcome: vi.fn(),
}));
vi.mock('./review-diff.js', () => ({ createReviewDiff: vi.fn(async () => 'reviewed diff') }));

const baseCommit = 'a'.repeat(40);
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
let sequence: JobSequenceWithTokens;
let review: PendingReview;

beforeEach(() => {
  vi.resetAllMocks();
  sequence = {
    id: '1',
    type: 'sync',
    description: 'Publish and sync reviewed course edits',
    authn_user_id: '2',
    jobs: [{ data: {}, status: 'Success', output: '' }],
  } as JobSequenceWithTokens;
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
  executeEditor.mockImplementation(async () => {
    sequence.jobs[0].data = {
      saveSucceeded: true,
      syncSucceeded: true,
    };
  });
  vi.mocked(getJobSequence).mockResolvedValue(sequence);
  prepareJob.mockResolvedValue({
    jobSequenceId: sequence.id,
    execute: vi.fn(),
    executeUnsafe: vi.fn(),
    executeInBackground: vi.fn(),
  });
});

async function decide(decision: 'approved' | 'denied', callId = review.callId) {
  return postReviewDecision({
    course,
    conversation,
    user: {
      id: '2',
      name: 'Instructor',
      email: 'instructor@example.com',
      uid: 'instructor@example.com',
    } as User,
    authzData: {
      has_course_permission_edit: true,
      authn_user: { id: '2' },
    },
    callId,
    decision,
  });
}

const modes = [
  {
    type: 'github',
    publication: { status: 'published' },
  },
  { type: 'local', publication: { status: 'saved_locally' } },
] as const;

function setLocalSnapshot() {
  sequence.description = 'Save and sync reviewed local course edits';
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
        jobSequenceId: '1',
      });
      await vi.waitFor(() => expect(deliverCourseAgentReviewOutcome).toHaveBeenCalledOnce());
      expect(MultiEditor).toHaveBeenCalledOnce();
      expect(FileUploadEditor).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          files: { '/tmp/course-agent-unit-test/question.html': Buffer.from('reviewed') },
        }),
      );
      expect(FileDeleteEditor).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ deletePath: '/tmp/course-agent-unit-test/old.html' }),
      );
      expect(executeEditor).toHaveBeenCalledOnce();
      const result = {
        decision: 'approved',
        publication,
        sync: { status: 'succeeded' },
      };
      expect(getReviewJobOutcome(sequence).result).toEqual(result);
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
  expect(prepareJob).not.toHaveBeenCalled();
  expect(executeEditor).not.toHaveBeenCalled();
});

it.each(modes)(
  'reports the $type save when sync fails afterward',
  async ({ type, publication }) => {
    await withConfig({ devMode: true, fileEditorUseGit: type === 'github' }, async () => {
      if (type === 'local') setLocalSnapshot();
      executeEditor.mockImplementation(async () => {
        sequence.jobs[0].data = {
          saveSucceeded: true,
        };
        sequence.jobs[0].status = 'Error';
        sequence.jobs[0].output =
          'Question questions/example: invalid configuration\nInvalid question configuration';
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

it('rejects a decision for an older pending call before starting a job', async () => {
  await expect(decide('approved', 'previous-review')).rejects.toThrow('This review has changed');
  expect(prepareJob).not.toHaveBeenCalled();
  expect(recordCourseAgentReviewDecision).not.toHaveBeenCalled();
});
