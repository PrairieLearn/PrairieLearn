import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { reconcileOperations } from '../ee/lib/course-agent/lifecycle.js';
import { createCloudflareProvider } from '../ee/lib/course-agent/provider.js';
import { authorize, newWorkEnabled } from '../ee/lib/course-agent/service.js';
import { features } from '../lib/features/index.js';
import {
  createConversation,
  rejectOperation,
  reserveOperation,
  selectConversation,
  selectConversationActivity,
  selectOptionalOperation,
} from '../models/course-agent-conversation.js';
import {
  insertCoursePermissionsByUserUid,
  updateCoursePermissionsRole,
} from '../models/course-permissions.js';
import { selectCourseById } from '../models/course.js';
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

it('fences uncertain sends, retries rejected dispatches and retains terminal status', async () => {
  const { scope, conversation } = await setupConversation();
  const operationId = randomUUID();
  await reserveOperation(conversation, operationId, { kind: 'message', text: 'hello' }, 0);
  const first = (await selectOptionalOperation(conversation.id, operationId))!;
  await execute(sql.age_operation, { id: first.id });
  const chat = {
    ...createCloudflareProvider(new URL('http://localhost:8791'), 'test'),
    getSnapshot: vi.fn().mockResolvedValue({ messages: [], operationNumber: 0, executions: {} }),
    reconcileAdmissions: vi.fn().mockResolvedValue({ rejected: [] }),
  };
  const empty = { messages: [], operationNumber: 0 };
  await reconcileOperations(conversation, chat, empty);
  expect((await selectOptionalOperation(conversation.id, operationId))!.status).toBe('admitted');
  chat.reconcileAdmissions.mockResolvedValue({ rejected: [first.dispatch_id] });
  await reconcileOperations(conversation, chat, empty);
  expect((await selectOptionalOperation(conversation.id, operationId))!.status).toBe('rejected');
  expect(
    await reserveOperation(conversation, operationId, { kind: 'message', text: 'hello' }, 0),
  ).toBe(1);
  const retry = (await selectOptionalOperation(conversation.id, operationId))!;
  expect(retry.dispatch_id).not.toBe(first.dispatch_id);
  await rejectOperation(conversation.id, operationId, first.dispatch_id);
  expect((await selectOptionalOperation(conversation.id, operationId))!.status).toBe('admitted');
  const receipt = {
    dispatchId: retry.dispatch_id,
    status: 'completed' as const,
    model: 'fixture',
    input: 0,
    cached: 0,
    output: 0,
  };
  for (const dispatchId of [first.dispatch_id, undefined]) {
    await reconcileOperations(conversation, chat, {
      ...empty,
      executions: { [operationId]: { ...receipt, dispatchId } },
    });
    expect((await selectOptionalOperation(conversation.id, operationId))!.status).toBe('admitted');
  }
  chat.getSnapshot.mockResolvedValue({ ...empty, executions: { [operationId]: receipt } });
  await reconcileOperations(conversation, chat, empty);
  expect(chat.getSnapshot).toHaveBeenLastCalledWith(expect.any(AbortSignal), [operationId]);
  await reconcileOperations(conversation, chat, {
    ...empty,
    executions: { [operationId]: { ...receipt, status: 'running' } },
  });
  expect((await selectOptionalOperation(conversation.id, operationId))!.status).toBe('completed');
  const activity = (await selectConversationActivity(scope)).find(
    (row) => row.conversation.id === conversation.id,
  )!;
  expect(activity.running).toBe(false);
  expect(activity.finished_at).toBeInstanceOf(Date);
});
