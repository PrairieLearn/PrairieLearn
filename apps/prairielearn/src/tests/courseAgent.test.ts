import { createHash, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { proposalContent } from '@prairielearn/course-agent-contract';
import * as namedLocks from '@prairielearn/named-locks';
import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { PublishRejected, Publisher } from '../ee/lib/course-agent/publish.js';
import {
  authorize,
  complete,
  newWorkEnabled,
  prepare,
  snapshot,
} from '../ee/lib/course-agent/service.js';
import * as courseLibrary from '../lib/course.js';
import { features } from '../lib/features/index.js';
import { createServerJob } from '../lib/server-jobs.js';
import {
  createConversation,
  recordConversationFinished,
  selectConversation,
  selectConversations,
} from '../models/course-agent-conversation.js';
import {
  decideProposal,
  insertProposal,
  prepareProposal,
  saveProposalProgress,
  selectOptionalProposal,
} from '../models/course-agent-proposal.js';
import {
  insertCoursePermissionsByUserUid,
  updateCoursePermissionsRole,
} from '../models/course-permissions.js';
import { selectCourseById, updateCourseColumn } from '../models/course.js';
import { selectOrInsertUserByUid } from '../models/user.js';

import * as helperServer from './helperServer.js';
import { withConfig } from './utils/config.js';

const sql = loadSqlEquiv(import.meta.url);
beforeAll(helperServer.before());
afterAll(helperServer.after);
it('scopes catalog rows and keeps completion timestamps monotonic without an operation ledger', async () => {
  const user = await selectOrInsertUserByUid('course-agent-test@example.com');
  const other = await selectOrInsertUserByUid('course-agent-other@example.com');
  const { id } = await queryRow(sql.course, z.object({ id: z.string() }));
  const scope = { course_id: id, user_id: user.id, authn_user_id: user.id };
  const conversation = await createConversation(scope, {
    title: 'Test',
    repository: 'org/course',
    branch: 'main',
  });
  await expect(
    selectConversation({ ...scope, user_id: other.id }, conversation.id),
  ).rejects.toThrow('Conversation not found');
  const newer = new Date('2026-10-09T01:00:00Z');
  await recordConversationFinished(conversation.id, newer);
  await recordConversationFinished(conversation.id, new Date('2026-10-08T01:00:00Z'));
  await recordConversationFinished(conversation.id, newer);
  expect(
    (await selectConversations(scope)).find((c) => c.id === conversation.id)?.last_finished_at,
  ).toEqual(newer);
});

const settings = {
  workerUrl: 'http://localhost:8791',
  serviceToken: 'local-fixture-service-token-not-a-secret',
  maxConcurrentPerUser: 2,
  hourlyCostLimit: 10,
  turnCostLimit: 2,
  requestCostLimit: 0.5,
  accountingEpoch: randomUUID(),
  maxTurnRuntimeMs: 1800000,
  maxToolCallsPerTurn: 100,
  maxModelRequestsPerTurn: 200,
};

async function setupConversation() {
  const user = await selectOrInsertUserByUid('course-agent-test@example.com');
  const { id } = await queryRow(sql.course, z.object({ id: z.string() }));
  const scope = { course_id: id, user_id: user.id, authn_user_id: user.id };
  const conversation = await createConversation(scope, {
    title: 'Review',
    repository: 'org/course',
    branch: 'main',
  });
  return { scope, conversation, user };
}
it('converges decision retries and enforces one unresolved proposal with a paired terminal outcome', async () => {
  const { scope, conversation } = await setupConversation();
  const operation_id = randomUUID();
  const proposal = (await insertProposal({
    conversation_id: conversation.id,
    operation_id,
    payload: JSON.stringify({ id: operation_id }),
    digest: 'immutable',
  }))!;
  await expect(
    insertProposal({
      conversation_id: conversation.id,
      operation_id: randomUUID(),
      payload: '{}',
      digest: 'another',
    }),
  ).rejects.toThrow();
  await decideProposal(scope, conversation, proposal, 'deny');
  await decideProposal(scope, conversation, proposal, 'deny');
  await expect(decideProposal(scope, conversation, proposal, 'approve')).rejects.toThrow(
    'Another decision',
  );
  await expect(saveProposalProgress(proposal.id, { outcome: 'Denied' })).rejects.toThrow();
  await saveProposalProgress(proposal.id, { outcome: 'Denied', outcome_success: true });
  expect(
    await insertProposal({
      conversation_id: conversation.id,
      operation_id: randomUUID(),
      payload: '{}',
      digest: 'fresh',
    }),
  ).not.toBeNull();
  expect((await selectOptionalProposal(conversation.id, operation_id))?.decision).toBe(false);
});
it('requires current owner access for both the effective and authenticated user', async () => {
  const { scope, user } = await setupConversation();
  const other = await selectOrInsertUserByUid('course-agent-other@example.com');
  await withConfig(
    {
      isEnterprise: true,
      courseAgent: settings,
      features: { 'course-agent': true },
      githubClientToken: 'test',
    },
    async () => {
      await insertCoursePermissionsByUserUid({
        course_id: scope.course_id,
        uid: user.uid,
        course_role: 'Owner',
        authn_user_id: user.id,
      });
      await authorize(scope, true);
      await expect(authorize({ ...scope, authn_user_id: other.id })).rejects.toThrow(
        'owner access',
      );
      await updateCoursePermissionsRole({
        course_id: scope.course_id,
        user_id: user.id,
        course_role: 'Viewer',
        authn_user_id: user.id,
      });
      await expect(authorize(scope)).rejects.toThrow('owner access');
    },
  );
});
it('uses the existing PL GitHub client token for proposal validation', async () => {
  const { conversation, scope, user } = await setupConversation();
  await insertCoursePermissionsByUserUid({
    course_id: scope.course_id,
    uid: user.uid,
    course_role: 'Owner',
    authn_user_id: user.id,
  });
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(null, { status: 404 }));
  const baseSha = 'a'.repeat(40),
    proposedSha = 'b'.repeat(40);
  const files = [
    { path: 'question.txt', content: 'Changed', mode: '100644', previousMode: '100644' },
  ];
  const id = randomUUID();
  try {
    await withConfig(
      { isEnterprise: true, courseAgent: settings, githubClientToken: 'fake-shared-client-token' },
      async () => {
        await prepare(scope, conversation, {
          id,
          name: 'push_sync',
          args: {
            id,
            baseSha,
            proposedSha,
            files,
            diff: '',
            status: 'pending',
            digest: createHash('sha256')
              .update(proposalContent(baseSha, proposedSha, files))
              .digest('hex'),
          },
        });
      },
    );
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain('/repos/org/course/');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fake-shared-client-token');
  } finally {
    fetcher.mockRestore();
  }
});

it('retains rejected captures as terminal product results and permits a fresh reviewed proposal', async () => {
  const { conversation, scope, user } = await setupConversation();
  await insertCoursePermissionsByUserUid({
    course_id: scope.course_id,
    uid: user.uid,
    course_role: 'Owner',
    authn_user_id: user.id,
  });
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => Response.json({ truncated: false, tree: [] }));
  const id = randomUUID(),
    baseSha = 'a'.repeat(40),
    proposedSha = 'b'.repeat(40);
  const files = [
    {
      path: 'courseInstances/Fall2026/infoCourseInstance.json',
      previousMode: '000000',
      mode: '100755',
      content: JSON.stringify({ uuid: randomUUID(), longName: 'Fall 2026', allowAccess: [] }),
    },
  ];
  const tool = {
    id,
    sequence: 1,
    name: 'push_sync',
    args: {
      id,
      baseSha,
      proposedSha,
      files,
      diff: '',
      status: 'pending',
      digest: createHash('sha256')
        .update(proposalContent(baseSha, proposedSha, files))
        .digest('hex'),
    },
  };
  try {
    await withConfig(
      { isEnterprise: true, courseAgent: settings, githubClientToken: 'fake-shared-client-token' },
      async () => {
        await prepare(scope, conversation, tool);
        const failed = (await selectOptionalProposal(conversation.id, id))!;
        expect(failed.prepared).toBe(false);
        expect(failed.error).toContain('ordinary text');
        expect(failed.outcome).toContain('Code change request failed');
        await prepare(scope, conversation, tool);
        expect(fetcher).toHaveBeenCalledOnce();
        const validId = randomUUID(),
          validFiles = [{ ...files[0], mode: '100644' }];
        await prepare(scope, conversation, {
          ...tool,
          id: validId,
          args: {
            ...tool.args,
            id: validId,
            files: validFiles,
            digest: createHash('sha256')
              .update(proposalContent(baseSha, proposedSha, validFiles))
              .digest('hex'),
          },
        });
        expect(
          (await snapshot(conversation, { messages: [], revision: 0 })).approvals.map((a) => a.id),
        ).toEqual([validId]);
      },
    );
  } finally {
    fetcher.mockRestore();
  }
});

it('blocks new work without publishing configuration while allowing history and recovery', async () => {
  const { scope, user } = await setupConversation();
  await insertCoursePermissionsByUserUid({
    course_id: scope.course_id,
    uid: user.uid,
    course_role: 'Owner',
    authn_user_id: user.id,
  });
  await withConfig(
    {
      isEnterprise: true,
      courseAgent: settings,
      features: { 'course-agent': true },
      githubClientToken: null,
    },
    async () => {
      await expect(authorize(scope, true)).rejects.toThrow(
        'GitHub publishing token is not configured',
      );
      await authorize(scope);
    },
  );
});

it.each(['transient', 'unconfigured'] as const)(
  'keeps a %s preparation failure retryable and exposes its saved recovery action',
  async (failure) => {
    const { conversation, scope, user } = await setupConversation();
    await insertCoursePermissionsByUserUid({
      course_id: scope.course_id,
      uid: user.uid,
      course_role: 'Owner',
      authn_user_id: user.id,
    });
    const id = randomUUID(),
      baseSha = 'a'.repeat(40),
      proposedSha = 'b'.repeat(40);
    const tool = {
      id,
      name: 'push_sync',
      args: {
        id,
        baseSha,
        proposedSha,
        files: [],
        diff: '',
        status: 'pending',
        digest: createHash('sha256')
          .update(proposalContent(baseSha, proposedSha, []))
          .digest('hex'),
      },
    };
    const preparation = vi.spyOn(Publisher.prototype, 'prepare').mockResolvedValue('');
    if (failure === 'transient') {
      preparation.mockRejectedValueOnce(new Error('Temporary GitHub outage'));
    }
    try {
      await withConfig(
        {
          isEnterprise: true,
          courseAgent: settings,
          features: { 'course-agent': true },
          githubClientToken: failure === 'unconfigured' ? null : 'test',
        },
        async () => {
          await expect(prepare(scope, conversation, tool)).rejects.toThrow(
            failure === 'unconfigured'
              ? 'GitHub publishing token is not configured'
              : 'Temporary GitHub outage',
          );
          expect((await selectOptionalProposal(conversation.id, id))!.error).toContain(
            failure === 'unconfigured'
              ? 'Configure githubClientToken'
              : 'Could not prepare the code change. Retry preparation.',
          );
          expect(preparation).toHaveBeenCalledTimes(failure === 'unconfigured' ? 0 : 1);
          expect((await selectOptionalProposal(conversation.id, id))!.outcome).toBeNull();
          expect(
            (
              await snapshot(conversation, {
                messages: [],
                revision: 0,
                conversationUsage: {
                  version: 0,
                  model: 'gpt-6-astra',
                  input: 0,
                  cached: 0,
                  cacheWrite: 0,
                  output: 0,
                },
              })
            ).preparation?.id,
          ).toBe(id);
          await withConfig({ githubClientToken: 'test' }, () => prepare(scope, conversation, tool));
          expect((await selectOptionalProposal(conversation.id, id))!.prepared).toBe(true);
          expect(
            (
              await snapshot(conversation, {
                messages: [],
                revision: 0,
                conversationUsage: {
                  version: 0,
                  model: 'gpt-6-astra',
                  input: 0,
                  cached: 0,
                  cacheWrite: 0,
                  output: 0,
                },
              })
            ).approvals,
          ).toHaveLength(1);
        },
      );
    } finally {
      preparation.mockRestore();
    }
  },
);

it.each([
  'transient',
  'preexisting validation',
  'preexisting question validation',
  'publication rejected',
  'ancestry',
] as const)(
  'retains publication and retries only the incomplete stage for a %s sync failure',
  async (failure) => {
    const { conversation, scope, user } = await setupConversation();
    await insertCoursePermissionsByUserUid({
      course_id: scope.course_id,
      uid: user.uid,
      course_role: 'Owner',
      authn_user_id: user.id,
    });
    for (const [columnName, value] of [
      ['repository', 'https://github.com/org/course.git'],
      ['branch', 'main'],
    ] as const) {
      await updateCourseColumn({
        courseId: scope.course_id,
        columnName,
        value,
        authnUserId: user.id,
      });
    }
    await execute(sql.baseline, {
      course_id: scope.course_id,
      commit_hash: 'a'.repeat(40),
      sync_errors:
        failure === 'preexisting validation'
          ? 'An unrelated file already contains an error.'
          : null,
    });
    await execute(sql.question_errors, {
      course_id: scope.course_id,
      sync_errors:
        failure === 'preexisting question validation'
          ? 'An unrelated question already contains an error.'
          : null,
    });
    const id = randomUUID();
    const approval = {
      id,
      baseSha: 'a'.repeat(40),
      proposedSha: 'b'.repeat(40),
      digest: 'test',
      files: [],
      diff: '',
      status: 'pending',
    };
    const row = (await insertProposal({
      conversation_id: conversation.id,
      operation_id: id,
      payload: JSON.stringify(approval),
      digest: 'test',
    }))!;
    await prepareProposal(row.id, approval, true, null);
    const jobs: Promise<unknown>[] = [];
    const push = vi.spyOn(Publisher.prototype, 'push').mockImplementation(async () => {
      if (failure === 'publication rejected') {
        throw new PublishRejected('Branch protection rejected the change.');
      }
      return 'c'.repeat(40);
    });
    let attempts = 0;
    const sync = vi
      .spyOn(courseLibrary, 'pullAndUpdateCourse')
      .mockImplementation(async (options) => {
        const job = await createServerJob({
          type: 'sync',
          description: 'Fixture sync',
          courseId: scope.course_id,
          userId: user.id,
          authnUserId: user.id,
        });
        await options.onJobCreated!(job.jobSequenceId);
        const attempt = ++attempts;
        const jobPromise = job.execute(async (task) => {
          if (failure === 'ancestry') {
            await options.onAncestryFailure!();
            task.fail('Published commit is not an ancestor');
          }
          if (failure !== 'transient') {
            await options.onValidationFailure!();
            task.fail('Existing JSON errors');
          }
          if (attempt === 1) task.fail('Temporary fetch timeout');
          await options.onSynced!('c'.repeat(40));
        });
        jobs.push(jobPromise);
        return { jobSequenceId: job.jobSequenceId, jobPromise };
      });
    const input = { id, digest: 'test', decision: 'approve' as const };
    try {
      await withConfig(
        {
          isEnterprise: true,
          courseAgent: settings,
          githubClientToken: 'test',
          features: { 'course-agent': true },
        },
        async () => {
          await complete(scope, conversation, input);
          await Promise.allSettled(jobs);
          if (failure === 'transient') {
            await complete(scope, conversation, input);
            await Promise.allSettled(jobs);
          }
          await complete(scope, conversation, input);
          const saved = (await selectOptionalProposal(conversation.id, id))!;
          expect(saved.outcome).not.toBeNull();
          expect(push).toHaveBeenCalledOnce();
          expect(sync).toHaveBeenCalledTimes(
            failure === 'publication rejected' ? 0 : failure === 'transient' ? 2 : 1,
          );
          const retainedOutcome =
            /GitHub commit c{40} was retained[\s\S]*instructor approval[\s\S]*Sync diagnostics:/;
          expect(saved.outcome).toMatch(
            {
              transient: /Course Sync completed/,
              'publication rejected': /Publication rejected: Branch protection/,
              ancestry: /GitHub publication was confirmed at c{40}[\s\S]*current remote history/,
              'preexisting validation': retainedOutcome,
              'preexisting question validation': retainedOutcome,
            }[failure],
          );
          expect(saved.outcome_success).toBe(failure === 'transient');
        },
      );
    } finally {
      for (const mock of [push, sync]) mock.mockRestore();
      await execute(sql.question_errors, { course_id: scope.course_id, sync_errors: null });
    }
  },
);

it('uses the authenticated owner feature grant while retaining recovery after disabling new work', async () => {
  const { scope, user } = await setupConversation();
  const authn = await selectOrInsertUserByUid('course-agent-authn-flag@example.com');
  for (const owner of [user, authn]) {
    await insertCoursePermissionsByUserUid({
      course_id: scope.course_id,
      uid: owner.uid,
      course_role: 'Owner',
      authn_user_id: owner.id,
    });
  }
  const actingScope = { ...scope, authn_user_id: authn.id };
  const course = await selectCourseById(scope.course_id);
  await features.enable('course-agent', { user_id: authn.id });
  try {
    await withConfig(
      {
        isEnterprise: true,
        courseAgent: settings,
        githubClientToken: 'test',
        features: { 'course-agent': false },
      },
      async () => {
        expect(await newWorkEnabled(actingScope, course)).toBe(true);
        expect(await newWorkEnabled(scope, course)).toBe(false);
        await authorize(actingScope, true);
        await features.disable('course-agent', { user_id: authn.id });
        expect(await newWorkEnabled(actingScope, course)).toBe(false);
        await expect(authorize(actingScope, true)).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await authorize(actingScope);
      },
    );
  } finally {
    await features.delete('course-agent', { user_id: authn.id });
  }
});

it('shows publication progress only while a webserver owns the publication lock', async () => {
  const { scope, conversation } = await setupConversation();
  const id = randomUUID();
  const proposal = {
    id,
    baseSha: 'a'.repeat(40),
    proposedSha: 'b'.repeat(40),
    status: 'pending',
    digest: 'test',
    files: [],
    diff: '',
  };
  const row = (await insertProposal({
    conversation_id: conversation.id,
    operation_id: id,
    payload: JSON.stringify(proposal),
    digest: 'test',
  }))!;
  await prepareProposal(row.id, proposal, true, null);
  await decideProposal(scope, conversation, row, 'approve');
  const value = { messages: [], revision: 0, blocked: true };
  expect((await snapshot(conversation, value)).publication?.status).toBe('retry');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let acquired!: () => void;
  const ready = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const publishing = namedLocks.doWithLock(
    `course-agent:proposal:${id}`,
    { timeout: 5000 },
    async () => {
      acquired();
      await gate;
    },
  );
  await ready;
  try {
    expect((await snapshot(conversation, value)).publication?.status).toBe('publishing');
  } finally {
    release();
    await publishing;
  }
  expect((await snapshot(conversation, value)).publication?.status).toBe('retry');
});
