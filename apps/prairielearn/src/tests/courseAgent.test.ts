import { createHash, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { type ToolOutcome, proposalContent } from '@prairielearn/course-agent-contract';
import * as namedLocks from '@prairielearn/named-locks';
import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import * as agentEvents from '../ee/lib/course-agent/events.js';
import * as agentObserver from '../ee/lib/course-agent/observer.js';
import * as agentProvider from '../ee/lib/course-agent/provider.js';
import { PublishRejected, Publisher } from '../ee/lib/course-agent/publish.js';
import {
  authorize,
  complete,
  provider as configuredProvider,
  newWorkEnabled,
  prepare,
  snapshot,
} from '../ee/lib/course-agent/service.js';
import { admit, estimatedCost, recordUsage } from '../ee/lib/course-agent/usage.js';
import { config } from '../lib/config.js';
import * as courseLibrary from '../lib/course.js';
import { features } from '../lib/features/index.js';
import { createServerJob } from '../lib/server-jobs.js';
import {
  createConversation,
  reserveOperation,
  selectConversation,
} from '../models/course-agent-conversation.js';
import { insertExecution, selectOptionalExecution } from '../models/course-agent-execution.js';
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
it('scopes conversations and serializes stale/duplicate admissions', async () => {
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
  const operation = randomUUID();
  expect(
    await reserveOperation(conversation, operation, { kind: 'message', text: 'hello' }, 0),
  ).toBe(1);
  expect(
    await reserveOperation(conversation, operation, { kind: 'message', text: 'hello' }, 0),
  ).toBe(1);
  await expect(
    reserveOperation(conversation, operation, { kind: 'message', text: 'changed' }, 0),
  ).rejects.toThrow('different input');
  await expect(
    reserveOperation(conversation, randomUUID(), { kind: 'message', text: 'stale' }, 0),
  ).rejects.toThrow('Conversation changed');
  const rows = await Promise.allSettled([
    reserveOperation(conversation, randomUUID(), { kind: 'message', text: 'a' }, 1),
    reserveOperation(conversation, randomUUID(), { kind: 'message', text: 'b' }, 1),
  ]);
  expect(rows.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
});

const settings = {
  workerUrl: 'http://localhost:8791',
  serviceToken: 'local-fixture-service-token-not-a-secret',
  pricing: { 'fixture-model': { input: 2, cachedInput: 0.5, output: 10 } },
  maxConcurrentPerUser: 1,
  maxConcurrentPerCourse: 1,
  maxRequestsPerHour: 3,
  dailyCostLimit: 20,
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
it('persists a single decision, gates new work, and allows an identical stale retry', async () => {
  const { scope, conversation } = await setupConversation();
  const operation_id = randomUUID();
  const proposal = (await insertProposal({
    conversation_id: conversation.id,
    operation_id,
    sequence: 1,
    payload: JSON.stringify({ id: operation_id }),
    digest: 'immutable',
  }))!;
  await expect(
    reserveOperation(conversation, randomUUID(), { kind: 'message' }, 0),
  ).rejects.toThrow('pending proposal');
  await decideProposal(scope, conversation, proposal, 'deny', 0);
  const saved = (await selectOptionalProposal(conversation.id, operation_id))!;
  expect(saved.decision).toBe(false);
  await decideProposal(scope, conversation, saved, 'deny', 0);
  await expect(decideProposal(scope, conversation, saved, 'approve', 1)).rejects.toThrow(
    'different input',
  );
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
it('serializes admissions, keeps missing usage unknown, and does not double-count snapshots', async () => {
  const { conversation } = await setupConversation();
  const { conversation: second } = await setupConversation();
  const mocked = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () =>
      Response.json({ messages: [], operationNumber: 0, executions: {} }),
    );
  try {
    await withConfig({ courseAgent: settings }, async () => {
      const a = { id: randomUUID(), text: 'a', expectedOperationNumber: 0 };
      const b = { id: randomUUID(), text: 'b', expectedOperationNumber: 0 };
      const admitted = await Promise.allSettled([admit(conversation, a), admit(second, b)]);
      expect(admitted.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const winner = admitted[0].status === 'fulfilled' ? conversation : second;
      const operation = admitted[0].status === 'fulfilled' ? a : b;
      expect((await selectOptionalExecution(winner.id, operation.id))?.input_tokens).toBeNull();
      await admit(winner, operation);
      const snapshot = {
        messages: [],
        operationNumber: 1,
        executions: {
          [operation.id]: {
            status: 'completed' as const,
            model: 'fixture-model',
            input: 1000,
            cached: 200,
            output: 100,
          },
        },
      };
      await recordUsage(winner, snapshot);
      await recordUsage(winner, snapshot);
      const execution = (await selectOptionalExecution(winner.id, operation.id))!;
      expect(execution.input_tokens).toBe(1000);
      expect(execution.estimated_cost).toBeCloseTo(0.0027);
      expect(
        estimatedCost(
          { input: null, cached: null, output: null },
          settings.pricing['fixture-model'],
        ),
      ).toBeNull();
      const stale = {
        ...snapshot,
        executions: {
          [operation.id]: {
            ...snapshot.executions[operation.id],
            status: 'running' as const,
            input: 500,
            output: 0,
          },
        },
      };
      await recordUsage(winner, stale);
      expect((await selectOptionalExecution(winner.id, operation.id))?.status).toBe('completed');
    });
  } finally {
    mocked.mockRestore();
  }
});

it('uses the existing PL GitHub client token for proposal validation', async () => {
  const { conversation, scope, user } = await setupConversation();
  await insertCoursePermissionsByUserUid({
    course_id: scope.course_id,
    uid: user.uid,
    course_role: 'Owner',
    authn_user_id: user.id,
  });
  const originalProvider = agentProvider.createCloudflareProvider;
  const providerMock = vi
    .spyOn(agentProvider, 'createCloudflareProvider')
    .mockImplementation((...args) => ({
      ...originalProvider(...args),
      getSnapshot: async () => ({ messages: [], operationNumber: 0 }),
      deliverToolResult: async () => {},
    }));
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(null, { status: 404 }));
  const notify = vi.spyOn(agentEvents, 'notify').mockResolvedValue();
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
        });
      },
    );
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain('/repos/org/course/');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fake-shared-client-token');
  } finally {
    providerMock.mockRestore();
    fetcher.mockRestore();
    notify.mockRestore();
  }
});

it('uses shared AI prices, preserves recorded rates, and leaves unsupported models unknown', async () => {
  const { conversation } = await setupConversation();
  expect(await recordUsage(conversation, { messages: [], operationNumber: 0 })).toEqual({
    input: 0,
    output: 0,
    estimatedCost: 0,
  });
  const id = randomUUID();
  await insertExecution(conversation.id, id);
  const snapshot = {
    messages: [],
    operationNumber: 0,
    executions: {
      [id]: {
        status: 'completed' as const,
        model: 'gpt-6-astra',
        input: 1000,
        cached: 200,
        output: 100,
      },
    },
  };
  await withConfig(
    {
      courseAgent: { ...settings, pricing: {} },
      costPerMillionTokens: {
        ...config.costPerMillionTokens,
        'gpt-6-astra': { input: 2, cachedInput: 0.5, cacheWrite: 0, output: 10 },
      },
    },
    async () => {
      await recordUsage(conversation, snapshot);
      expect((await selectOptionalExecution(conversation.id, id))?.estimated_cost).toBeCloseTo(
        0.0027,
      );
    },
  );
  await withConfig(
    {
      courseAgent: {
        ...settings,
        pricing: { 'gpt-6-astra': { input: 20, cachedInput: 5, output: 100 } },
      },
    },
    async () => {
      await recordUsage(conversation, snapshot);
      expect((await selectOptionalExecution(conversation.id, id))?.estimated_cost).toBeCloseTo(
        0.0027,
      );
    },
  );
  const unknown = randomUUID();
  await insertExecution(conversation.id, unknown);
  await recordUsage(conversation, {
    ...snapshot,
    executions: { [unknown]: { ...snapshot.executions[id], model: 'unsupported-fixture-model' } },
  });
  expect((await selectOptionalExecution(conversation.id, unknown))?.estimated_cost).toBeNull();
});

it('returns unsupported file modes to the agent, retries delivery, and only exposes supported approvals', async () => {
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
  const notify = vi.spyOn(agentEvents, 'notify').mockResolvedValue();
  const delivery = vi
    .fn<(input: ToolOutcome, signal: AbortSignal) => Promise<void>>()
    .mockRejectedValueOnce(new Error('Delivery interrupted'))
    .mockResolvedValue(undefined);
  const originalProvider = agentProvider.createCloudflareProvider;
  const providerMock = vi
    .spyOn(agentProvider, 'createCloudflareProvider')
    .mockImplementation((...args) => ({
      ...originalProvider(...args),
      getSnapshot: async () => ({ messages: [], operationNumber: 0 }),
      deliverToolResult: delivery,
    }));
  const id = randomUUID();
  const baseSha = 'a'.repeat(40),
    proposedSha = 'b'.repeat(40);
  const files = [
    {
      path: 'courseInstances/Fall2026/infoCourseInstance.json',
      previousMode: '000000',
      mode: '100755',
      content: JSON.stringify({ uuid: randomUUID(), longName: 'Fall 2026', accessRules: [] }),
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
        await expect(prepare(scope, conversation, tool)).rejects.toThrow('Delivery interrupted');
        const failed = (await selectOptionalProposal(conversation.id, id))!;
        expect(failed.prepared).toBe(false);
        expect(failed.decision).toBeNull();
        expect(failed.error).toContain('ordinary text');
        expect(failed.outcome).toContain('Code change request failed');
        expect(
          (await snapshot(conversation, { messages: [], operationNumber: 0 })).approvals,
        ).toEqual([]);
        await expect(
          reserveOperation(conversation, randomUUID(), { kind: 'message' }, 0),
        ).rejects.toThrow('pending proposal');
        await prepare(scope, conversation, tool);
        expect(fetcher).toHaveBeenCalledOnce();
        expect(delivery.mock.calls[1][0]).toMatchObject({
          id,
          success: false,
          display: { name: 'push_sync', value: { error: failed.error } },
        });
        expect((await selectOptionalProposal(conversation.id, id))!.delivered).toBe(true);
        expect(await reserveOperation(conversation, randomUUID(), { kind: 'message' }, 0)).toBe(1);
        const validId = randomUUID();
        const validFiles = [
          {
            ...files[0],
            mode: '100644',
            content: JSON.stringify({ uuid: randomUUID(), longName: 'Fall 2026', allowAccess: [] }),
          },
        ];
        await prepare(scope, conversation, {
          ...tool,
          id: validId,
          sequence: 2,
          args: {
            ...tool.args,
            id: validId,
            files: validFiles,
            digest: createHash('sha256')
              .update(proposalContent(baseSha, proposedSha, validFiles))
              .digest('hex'),
          },
        });
        const state = await snapshot(conversation, { messages: [], operationNumber: 0 });
        expect(state.approvals).toHaveLength(1);
        expect(state.approvals[0].id).toBe(validId);
        expect(delivery).toHaveBeenCalledTimes(2);
      },
    );
  } finally {
    providerMock.mockRestore();
    fetcher.mockRestore();
    notify.mockRestore();
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
      sequence: 1,
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
    const notify = vi.spyOn(agentEvents, 'notify').mockResolvedValue();
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
            (await snapshot(conversation, { messages: [], operationNumber: 0 })).preparation?.id,
          ).toBe(id);
          await withConfig({ githubClientToken: 'test' }, () => prepare(scope, conversation, tool));
          expect((await selectOptionalProposal(conversation.id, id))!.prepared).toBe(true);
          expect(
            (await snapshot(conversation, { messages: [], operationNumber: 0 })).approvals,
          ).toHaveLength(1);
        },
      );
    } finally {
      preparation.mockRestore();
      notify.mockRestore();
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
      sequence: 1,
      payload: JSON.stringify(approval),
      digest: 'test',
    }))!;
    await prepareProposal(row.id, approval, true, null);
    const delivery = vi.fn<(input: ToolOutcome) => Promise<void>>().mockResolvedValue();
    const original = agentProvider.createCloudflareProvider;
    const mocks = [
      vi.spyOn(agentEvents, 'notify').mockResolvedValue(),
      vi.spyOn(agentObserver, 'observe').mockResolvedValue(),
      vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => Response.json({ model: 'fixture-model' })),
      vi.spyOn(agentProvider, 'createCloudflareProvider').mockImplementation((...args) => ({
        ...original(...args),
        getSnapshot: async () => ({
          messages: [],
          operationNumber: 0,
          executions: {
            [id]: {
              status: 'running',
              model: 'fixture',
              input: null,
              cached: null,
              output: null,
            },
          },
        }),
        deliverToolResult: delivery,
      })),
    ];
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
        return {
          jobSequenceId: job.jobSequenceId,
          jobPromise: job.execute(async (task) => {
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
          }),
        };
      });
    const input = { id, digest: 'test', expectedOperationNumber: 0, decision: 'approve' as const };
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
          if (failure === 'transient') {
            await vi.waitFor(async () => {
              const saved = (await selectOptionalProposal(conversation.id, id))!;
              if (!saved.error?.includes('retry completion') || saved.outcome !== null) {
                throw new Error('Waiting for retryable sync failure');
              }
            });
            await complete(scope, conversation, input);
          }
          await expect
            .poll(async () => (await selectOptionalProposal(conversation.id, id))?.delivered)
            .toBe(true);
          expect(push).toHaveBeenCalledOnce();
          expect(sync).toHaveBeenCalledTimes(
            failure === 'publication rejected' ? 0 : failure === 'transient' ? 2 : 1,
          );
          const retainedOutcome =
            /GitHub commit c{40} was retained[\s\S]*instructor approval[\s\S]*Sync diagnostics:/;
          expect(delivery.mock.calls[0][0].result).toMatch(
            {
              transient: /Course Sync completed/,
              'publication rejected': /Publication rejected: Branch protection/,
              ancestry: /GitHub publication was confirmed at c{40}[\s\S]*current remote history/,
              'preexisting validation': retainedOutcome,
              'preexisting question validation': retainedOutcome,
            }[failure],
          );
          expect(delivery.mock.calls[0][0].success).toBe(failure === 'transient');
        },
      );
    } finally {
      for (const mock of [...mocks, push, sync]) mock.mockRestore();
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

it('requires exact configured model pricing before starting an execution', async () => {
  const { scope, user, conversation } = await setupConversation();
  await insertCoursePermissionsByUserUid({
    course_id: scope.course_id,
    uid: user.uid,
    course_role: 'Owner',
    authn_user_id: user.id,
  });
  await updateCourseColumn({
    courseId: scope.course_id,
    columnName: 'repository',
    value: 'https://github.com/org/course.git',
    authnUserId: user.id,
  });
  await updateCourseColumn({
    courseId: scope.course_id,
    columnName: 'branch',
    value: 'main',
    authnUserId: user.id,
  });
  const request = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => Response.json({ model: 'unpriced-model' }));
  try {
    await withConfig(
      { isEnterprise: true, courseAgent: settings, features: { 'course-agent': true } },
      async () => {
        await expect(configuredProvider(scope, conversation, true)).rejects.toThrow(
          'Configure course agent pricing for unpriced-model',
        );
        request.mockImplementation(async () => Response.json({ model: 'fixture-model' }));
        await expect(configuredProvider(scope, conversation, true)).resolves.toBeDefined();
      },
    );
  } finally {
    request.mockRestore();
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
    sequence: 1,
    payload: JSON.stringify(proposal),
    digest: 'test',
  }))!;
  await prepareProposal(row.id, proposal, true, null);
  await decideProposal(scope, conversation, row, 'approve', 0);
  const value = { messages: [], operationNumber: 0, blocked: true };
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

it('does not offer retry while an approved, synced outcome is resuming a cold sandbox', async () => {
  const { scope, conversation, user } = await setupConversation();
  const id = randomUUID();
  const approval = {
    id,
    baseSha: 'a'.repeat(40),
    proposedSha: 'b'.repeat(40),
    status: 'pending',
    digest: 'cold-sync',
    files: [],
    diff: '',
  };
  const row = (await insertProposal({
    conversation_id: conversation.id,
    operation_id: id,
    sequence: 1,
    payload: JSON.stringify(approval),
    digest: approval.digest,
  }))!;
  await prepareProposal(row.id, approval, true, null);
  await decideProposal(scope, conversation, row, 'approve', 0);
  const sync = await createServerJob({
    type: 'sync',
    description: 'Cold approval fixture',
    courseId: scope.course_id,
    userId: user.id,
    authnUserId: user.id,
  });
  await sync.execute(async () => {});
  await saveProposalProgress(row.id, {
    sync_job_sequence_id: sync.jobSequenceId,
    published_sha: 'c'.repeat(40),
    synced_sha: 'c'.repeat(40),
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let acquired!: () => void;
  const ready = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const completing = namedLocks.doWithLock(
    `course-agent:proposal:${id}`,
    { timeout: 5000 },
    async () => {
      acquired();
      await gate;
    },
  );
  await ready;
  const value = { messages: [], operationNumber: 0, blocked: true };
  try {
    expect((await snapshot(conversation, value)).publication?.status).toBe('publishing');
    await saveProposalProgress(row.id, {
      outcome: 'Published and synced. Restoring the sandbox.',
      outcome_success: true,
    });
    expect((await snapshot(conversation, value)).publication?.status).toBe('publishing');
  } finally {
    release();
    await completing;
  }
  expect((await snapshot(conversation, value)).publication?.status).toBe('retry');
  await saveProposalProgress(row.id, { delivered: true });
  expect((await snapshot(conversation, value)).publication?.status).toBe('complete');
});
