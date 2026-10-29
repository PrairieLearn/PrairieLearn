import { scheduler } from 'node:timers/promises';

import { getAgentByName } from 'agents';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { PushSyncResult, ReviewSnapshot } from '@prairielearn/course-agent-types';
import type { doWithLock } from '@prairielearn/named-locks';
import type { runInTransactionAsync } from '@prairielearn/postgres';

import { deliverCourseAgentReviewOutcome } from '../../prairielearn/src/ee/lib/course-agent/client.js';
import {
  getPendingReview,
  postReviewDecision,
} from '../../prairielearn/src/ee/lib/course-agent/push-sync.js';
import { config } from '../../prairielearn/src/lib/config.js';
import type { Course, CourseAgentConversation, Job } from '../../prairielearn/src/lib/db-types.js';
import { getGithubClient } from '../../prairielearn/src/lib/github.js';
import {
  type ServerJob,
  createServerJob,
  selectJobsByJobSequenceId,
} from '../../prairielearn/src/lib/server-jobs.js';
import { selectCourseById } from '../../prairielearn/src/models/course.js';
import { syncDiskToSqlWithLock } from '../../prairielearn/src/sync/syncFromDisk.js';
import { Conversation } from '../src/conversation/conversation.js';
import app from '../src/http/routes.js';

import type { AIChatAgent } from './chat-fixture.js';
import { nativeRunner } from './native-fixture.js';

vi.mock('@cloudflare/ai-chat', () => import('./chat-fixture.js'));
vi.mock('agents', () => ({ getAgentByName: vi.fn() }));
vi.mock('../src/monitoring.js', () => ({ reportError: vi.fn() }));
vi.mock('@prairielearn/named-locks', () => ({
  doWithLock: vi.fn<typeof doWithLock>(async (_name, _options, fn) => fn()),
}));
vi.mock('@prairielearn/postgres', () => ({
  runInTransactionAsync: async (fn: () => ReturnType<typeof runInTransactionAsync>) => fn(),
}));
vi.mock('../../prairielearn/src/lib/github.js', () => ({ getGithubClient: vi.fn() }));
vi.mock('../../prairielearn/src/lib/server-jobs.js', () => ({
  createServerJob: vi.fn(),
  selectJobsByJobSequenceId: vi.fn(),
}));
vi.mock('../../prairielearn/src/models/audit-event.js', () => ({ insertAuditEvent: vi.fn() }));
vi.mock('../../prairielearn/src/models/course.js', () => ({
  selectCourseById: vi.fn(),
  getLockNameForCoursePath: vi.fn(),
  updateCourseCommitHash: vi.fn(),
}));
vi.mock('../../prairielearn/src/sync/syncFromDisk.js', () => ({ syncDiskToSqlWithLock: vi.fn() }));

const baseCommit = 'a'.repeat(40);
const publishedCommit = 'b'.repeat(40);
const conversation: CourseAgentConversation = {
  id: '1',
  course_id: '1',
  user_id: '2',
  agent_conversation_id: '00000000-0000-4000-8000-000000000001',
  title: 'Update question',
  created_at: new Date(0),
};
const course = {
  id: '1',
  repository: 'https://github.com/PrairieLearn/course.git',
  branch: 'master',
  path: '/tmp/course-agent-flow-test',
} as Course;
const published: PushSyncResult = {
  decision: 'approved',
  publication: { status: 'published', commitSha: publishedCommit },
  sync: { status: 'succeeded' },
};
const denied: PushSyncResult = {
  decision: 'denied',
  publication: { status: 'not_attempted' },
  sync: { status: 'not_attempted' },
};
const graphql = vi.fn();
const getBranch = vi.fn();
let agent: Conversation;
let model: ReturnType<typeof nativeRunner>;
let snapshot: ReviewSnapshot;
let sandbox: {
  fetch: ReturnType<typeof nativeRunner>['fetch'];
  captureReview: ReturnType<typeof vi.fn>;
  prepare: ReturnType<typeof vi.fn>;
  checkpoint: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  stopProcesses: ReturnType<typeof vi.fn>;
};
let ctx: DurableObjectState;
let env: Env;
let job: ServerJob;
let savedJob: Record<string, unknown>;
let failDelivery: boolean;
const originalConfig = {
  courseAgentServiceUrl: config.courseAgentServiceUrl,
  courseAgentServiceToken: config.courseAgentServiceToken,
};

function chat() {
  return agent as unknown as AIChatAgent;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubGlobal('scheduler', scheduler);
  model = nativeRunner();
  snapshot = {
    repository: 'PrairieLearn/course',
    branch: 'master',
    baseCommit,
    additions: [
      { path: 'question.html', contents: Buffer.from('Reviewed question\n').toString('base64') },
      { path: 'new.html', contents: Buffer.from('New question\n').toString('base64') },
    ],
    deletions: [{ path: 'old.html' }],
  };
  sandbox = {
    fetch: model.fetch,
    captureReview: vi.fn(async () => structuredClone(snapshot)),
    prepare: vi.fn(),
    stopProcesses: vi.fn(),
    destroy: vi.fn(),
    checkpoint: vi.fn(async () => ({
      id: 'checkpoint',
      dir: '/workspace/session',
      size: 1,
      sha256: 'a'.repeat(64),
      format: 'tar+zstd/1',
    })),
  };
  const storage = new Map<string, unknown>();
  ctx = {
    storage: {
      kv: {
        get: (key: string) => storage.get(key),
        put: (key: string, value: unknown) => storage.set(key, structuredClone(value)),
        delete: (key: string) => storage.delete(key),
      },
    },
  } as unknown as DurableObjectState;
  env = {
    OPENAI_MODEL: 'test',
    AGENT_TURN_SECONDS: '600',
    USER_IDLE_SECONDS: '60',
    PL_SERVICE_URL: 'http://pl.test',
    PL_SERVICE_TOKEN: 'test-token',
    CourseSandbox: { getByName: () => sandbox },
  } as unknown as Env;
  agent = new Conversation(ctx, env);
  agent.initialize({ type: 'github', repository: snapshot.repository, branch: snapshot.branch });
  vi.mocked(getAgentByName).mockImplementation(
    async () => agent as unknown as Awaited<ReturnType<typeof getAgentByName>>,
  );
  failDelivery = false;
  savedJob = {};
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init);
      if (request.url.startsWith(env.PL_SERVICE_URL)) {
        return Response.json({
          callId: savedJob.callId,
          jobSequenceId: '1',
          status: savedJob.result ? 'completed' : 'blocked',
          result: savedJob.result ?? null,
          error: savedJob.error ?? null,
        });
      }
      if (failDelivery && request.url.endsWith('/outcome')) {
        return new Response(null, { status: 503 });
      }
      return app.fetch(request, env);
    }),
  );
  Object.assign(config, {
    courseAgentServiceUrl: 'http://agent.test',
    courseAgentServiceToken: env.PL_SERVICE_TOKEN,
  });
  vi.mocked(selectCourseById).mockResolvedValue(course);
  vi.mocked(getGithubClient).mockReturnValue({
    repos: { getBranch },
    graphql,
    git: {
      getTree: async () => ({
        data: {
          truncated: false,
          tree: ['question.html', 'old.html'].map((path) => ({
            path,
            sha: path,
            type: 'blob',
            mode: '100644',
          })),
        },
      }),
      getBlob: async () => ({
        data: { content: Buffer.from('Original question\n').toString('base64') },
      }),
    },
  } as unknown as NonNullable<ReturnType<typeof getGithubClient>>);
  getBranch.mockResolvedValue({ data: { commit: { sha: baseCommit } } });
  graphql.mockResolvedValue({ createCommitOnBranch: { commit: { oid: publishedCommit } } });
  vi.mocked(syncDiskToSqlWithLock).mockResolvedValue({
    status: 'complete',
    hadJsonErrors: false,
  } as Awaited<ReturnType<typeof syncDiskToSqlWithLock>>);
  job = {
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
  vi.mocked(selectJobsByJobSequenceId).mockResolvedValue([{ id: '1' } as Job]);
  vi.mocked(createServerJob).mockResolvedValue({
    jobSequenceId: '1',
    execute: async (fn) => {
      await fn(job).catch(() => {});
      savedJob = structuredClone(job.data);
      return { data: savedJob };
    },
    executeUnsafe: vi.fn(),
    executeInBackground: vi.fn(),
  });
});

afterEach(async () => {
  model.close();
  await Promise.all(chat().background);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Object.assign(config, originalConfig);
});

async function requestReview(callId = 'review-1') {
  await agent.persistMessages([
    ...agent.messages,
    {
      id: crypto.randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: 'Edit this question and push sync' }],
    },
  ]);
  const response = chat().respond({ requestId: callId });
  await vi.waitFor(() => expect(chat().state.status).toBe('waiting_for_agent'));
  model.requestReview(callId);
  await response;
  await vi.waitFor(() => expect(agent.getPendingReview()?.callId).toBe(callId));
  return (await getPendingReview(course, conversation, '2', callId))!;
}

async function sleep() {
  vi.setSystemTime(Date.parse(chat().deadline.at) + 1);
  await agent.onDeadline(chat().deadline);
  expect(chat().state.status).toBe('offline');
  expect(sandbox.checkpoint).toHaveBeenCalledOnce();
  expect(sandbox.destroy).toHaveBeenCalledOnce();
  agent = new Conversation(ctx, env);
  await agent.onStart();
}

function decide(reviewToken: string, decision: 'approved' | 'denied') {
  return postReviewDecision({
    course,
    conversation,
    user: { id: '2' },
    authnUserId: '2',
    reviewToken,
    decision,
  });
}

async function expectContinued(result: PushSyncResult) {
  await vi.waitFor(() => expect(model.results).toEqual([result]));
  await vi.waitFor(() => expect(agent.getPendingReview()).toBeNull());
  expect(chat().outcome).toMatchObject({ state: 'output-available', output: result });
  expect(agent.messages.flatMap((message) => message.parts)).toContainEqual(
    expect.objectContaining({ type: 'text', text: `Review ${result.decision}.` }),
  );
}

async function reviewWithAgent(state: 'waiting' | 'asleep') {
  const review = await requestReview();
  if (state === 'asleep') await sleep();
  return review;
}

function expectNativeContinuation(state: 'waiting' | 'asleep', result: PushSyncResult) {
  expect(model.submissions).toHaveLength(state === 'asleep' ? 2 : 1);
  expect(model.submissions.slice(1)).toEqual(
    state === 'asleep'
      ? [
          expect.objectContaining({
            input: [],
            toolOutput: expect.objectContaining({
              output: JSON.stringify({ callId: 'review-1', result }),
            }),
          }),
        ]
      : [],
  );
  expect(sandbox.prepare.mock.calls.map((call) => call[1])).toEqual(
    state === 'asleep' ? [null, expect.objectContaining({ id: 'checkpoint' })] : [null],
  );
}

it.each(['waiting', 'asleep'] as const)(
  'approve while the agent is %s: publish reviewed edits, sync, and continue',
  async (state) => {
    const review = await reviewWithAgent(state);
    expect(review.diff.patch).toContain('+Reviewed question');
    expect(review.diff.patch).toContain('+New question');
    expect(review.diff.patch).toContain('--- old.html');
    const reviewedFiles = structuredClone({
      additions: snapshot.additions,
      deletions: snapshot.deletions,
    });
    snapshot.additions[0].contents = Buffer.from('Later unreviewed edit\n').toString('base64');
    await expect(decide(review.reviewToken, 'approved')).resolves.toEqual({
      decision: 'approved',
      jobSequenceId: '1',
    });
    await expectContinued(published);
    expect(graphql).toHaveBeenCalledExactlyOnceWith(expect.any(String), {
      input: {
        branch: { repositoryNameWithOwner: snapshot.repository, branchName: snapshot.branch },
        expectedHeadOid: baseCommit,
        message: { headline: 'Apply reviewed course agent edits' },
        fileChanges: reviewedFiles,
      },
    });
    expect(syncDiskToSqlWithLock).toHaveBeenCalledOnce();
    expect(job.exec).toHaveBeenCalledWith(
      'git',
      ['reset', '--hard', publishedCommit],
      expect.objectContaining({ cwd: course.path }),
    );
    expect(savedJob.result).toEqual(published);
    expectNativeContinuation(state, published);
  },
);

it.each(['waiting', 'asleep'] as const)(
  'deny while the agent is %s: preserve edits and continue without publication or sync',
  async (state) => {
    const review = await reviewWithAgent(state);
    await expect(decide(review.reviewToken, 'denied')).resolves.toEqual({
      decision: 'denied',
      jobSequenceId: null,
    });
    await expectContinued(denied);
    expect(graphql).not.toHaveBeenCalled();
    expect(syncDiskToSqlWithLock).not.toHaveBeenCalled();
    expect(createServerJob).not.toHaveBeenCalled();
    expect(job.exec).not.toHaveBeenCalled();
    expectNativeContinuation(state, denied);
  },
);

it('repeated approval and callback publish and continue only once; conflicting decisions are rejected', async () => {
  const review = await requestReview();
  const publication = Promise.withResolvers<unknown>();
  graphql.mockReturnValue(publication.promise);
  await decide(review.reviewToken, 'approved');
  await expect(decide(review.reviewToken, 'approved')).resolves.toEqual({
    decision: 'approved',
    jobSequenceId: '1',
  });
  await expect(decide(review.reviewToken, 'denied')).rejects.toThrow(
    'already has a different decision',
  );
  const saving = Promise.withResolvers<undefined>();
  const saved = Promise.withResolvers<undefined>();
  const persist = agent.persistMessages.bind(agent);
  vi.spyOn(agent, 'persistMessages').mockImplementationOnce(async (messages) => {
    saving.resolve(undefined);
    await saved.promise;
    await persist(messages);
  });
  publication.resolve({ createCommitOnBranch: { commit: { oid: publishedCommit } } });
  await saving.promise;
  const duplicate = deliverCourseAgentReviewOutcome(conversation.agent_conversation_id, {
    callId: 'review-1',
    result: published,
  });
  await expect(
    deliverCourseAgentReviewOutcome(conversation.agent_conversation_id, {
      callId: 'review-1',
      result: denied,
    }),
  ).rejects.toThrow('Could not deliver');
  saved.resolve(undefined);
  await duplicate;
  await expectContinued(published);
  expect(chat().continueLastTurn).toHaveBeenCalledOnce();
  expect(graphql).toHaveBeenCalledOnce();
  expect(syncDiskToSqlWithLock).toHaveBeenCalledOnce();
  expect(model.results).toEqual([published]);
});

it('an approval for a replaced review cannot publish the new edits', async () => {
  const old = await requestReview();
  await decide(old.reviewToken, 'denied');
  await expectContinued(denied);
  const current = await requestReview('review-2');
  await expect(decide(old.reviewToken, 'approved')).rejects.toThrow('This review has changed');
  expect(agent.getPendingReview()?.callId).toBe(current.callId);
  expect(graphql).not.toHaveBeenCalled();
});

it('a branch update before approval leaves the remote untouched and tells the agent to fetch updates', async () => {
  const review = await requestReview();
  getBranch.mockResolvedValue({ data: { commit: { sha: 'c'.repeat(40) } } });
  await decide(review.reviewToken, 'approved');
  await expectContinued({
    decision: 'approved',
    publication: {
      status: 'failed',
      error: 'The course branch changed. Ask the agent to fetch updates and request a new review.',
    },
    sync: { status: 'not_attempted' },
  });
  expect(graphql).not.toHaveBeenCalled();
  expect(syncDiskToSqlWithLock).not.toHaveBeenCalled();
});

it('uncertain publication requires inspection instead of retrying or reporting success', async () => {
  const review = await requestReview();
  graphql.mockRejectedValue(new Error('GitHub connection lost'));
  await decide(review.reviewToken, 'approved');
  await vi.waitFor(() =>
    expect(savedJob.error).toContain('GitHub publication could not be confirmed'),
  );
  expect(savedJob.result).toBeUndefined();
  await expect(agent.resume()).rejects.toThrow('GitHub publication could not be confirmed');
  expect(agent.getPendingReview()).toMatchObject({ status: 'blocked' });
  expect(model.results).toEqual([]);
  expect(syncDiskToSqlWithLock).not.toHaveBeenCalled();
  expect(graphql).toHaveBeenCalledOnce();
});

it('Course Sync failure keeps the published commit and delivers its diagnostics to the agent', async () => {
  const review = await requestReview();
  vi.mocked(syncDiskToSqlWithLock).mockRejectedValue(new Error('Invalid question configuration'));
  await decide(review.reviewToken, 'approved');
  await expectContinued({
    ...published,
    sync: { status: 'failed', error: 'Invalid question configuration' },
  });
  expect(graphql).toHaveBeenCalledOnce();
});

it('Resume retrieves a missed publication outcome without publishing or syncing again', async () => {
  const review = await requestReview();
  failDelivery = true;
  await decide(review.reviewToken, 'approved');
  await vi.waitFor(() => expect(savedJob.result).toEqual(published));
  expect(model.results).toEqual([]);
  await sleep();
  failDelivery = false;
  await expect(agent.resume()).resolves.toBe(true);
  await expectContinued(published);
  expect(graphql).toHaveBeenCalledOnce();
  expect(syncDiskToSqlWithLock).toHaveBeenCalledOnce();
});
