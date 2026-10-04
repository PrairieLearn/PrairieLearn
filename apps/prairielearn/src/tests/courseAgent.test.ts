import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import {
  authorize,
  provider as configuredProvider,
  newWorkEnabled,
} from '../ee/lib/course-agent/service.js';
import { admit, estimatedCost, recordUsage } from '../ee/lib/course-agent/usage.js';
import { config } from '../lib/config.js';
import { features } from '../lib/features/index.js';
import {
  createConversation,
  reserveOperation,
  selectConversation,
} from '../models/course-agent-conversation.js';
import { insertExecution, selectOptionalExecution } from '../models/course-agent-execution.js';
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
      { isEnterprise: true, courseAgent: settings, features: { 'course-agent': false } },
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
