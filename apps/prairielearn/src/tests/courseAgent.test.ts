import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { authorize } from '../ee/lib/course-agent/service.js';
import { admit, estimatedCost, recordUsage } from '../ee/lib/course-agent/usage.js';
import {
  createConversation,
  editConversation,
  reserveOperation,
  selectConversation,
} from '../models/course-agent-conversation.js';
import { selectOptionalExecution } from '../models/course-agent-execution.js';
import {
  decideProposal,
  insertProposal,
  selectOptionalProposal,
} from '../models/course-agent-proposal.js';
import {
  insertCoursePermissionsByUserUid,
  updateCoursePermissionsRole,
} from '../models/course-permissions.js';
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
  publicationTokens: {},
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
  await expect(editConversation(scope, conversation.id, null, true)).rejects.toThrow(
    'pending proposal',
  );
  await decideProposal(scope, conversation, proposal, false, 0);
  const saved = (await selectOptionalProposal(conversation.id, operation_id))!;
  expect(saved.decision).toBe(false);
  await decideProposal(scope, conversation, saved, false, 0);
  await expect(decideProposal(scope, conversation, saved, true, 1)).rejects.toThrow(
    'different input',
  );
  expect((await selectOptionalProposal(conversation.id, operation_id))?.decision).toBe(false);
});
it('requires current owner access for both the effective and authenticated user', async () => {
  const { scope, user } = await setupConversation();
  const other = await selectOrInsertUserByUid('course-agent-other@example.com');
  await withConfig(
    { isEnterprise: true, courseAgent: settings, features: { 'course-agent': true } },
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
    .mockResolvedValue(Response.json({ messages: [], revision: 0, executions: {} }));
  try {
    await withConfig({ courseAgent: settings }, async () => {
      const a = { id: randomUUID(), text: 'a', expectedRevision: 0 };
      const b = { id: randomUUID(), text: 'b', expectedRevision: 0 };
      const admitted = await Promise.allSettled([admit(conversation, a), admit(second, b)]);
      expect(admitted.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const winner = admitted[0].status === 'fulfilled' ? conversation : second;
      const operation = admitted[0].status === 'fulfilled' ? a : b;
      expect((await selectOptionalExecution(winner.id, operation.id))?.input_tokens).toBeNull();
      await admit(winner, operation);
      const snapshot = {
        messages: [],
        revision: 1,
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
