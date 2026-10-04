import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ChatError } from '@prairielearn/course-agent-contract';
import * as namedLocks from '@prairielearn/named-locks';
import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

import * as provider from '../ee/lib/course-agent/provider.js';
import { admit, recordUsage } from '../ee/lib/course-agent/usage.js';
import { createConversation } from '../models/course-agent-conversation.js';
import {
  rejectExecution,
  selectActiveExecution,
  selectOptionalExecution,
} from '../models/course-agent-execution.js';
import { selectOrInsertUserByUid } from '../models/user.js';

import * as helperDb from './helperDb.js';
import * as helperServer from './helperServer.js';
import { withConfig } from './utils/config.js';

const sql = loadSqlEquiv(import.meta.url);
const settings = {
  workerUrl: 'http://localhost:8791',
  serviceToken: 'local-fixture-service-token-not-a-secret',
  pricing: { fixture: { input: 1, cachedInput: 0.1, output: 1 } },
  maxConcurrentPerUser: 1,
  maxConcurrentPerCourse: 1,
  maxRequestsPerHour: 100,
  dailyCostLimit: 20,
};
beforeAll(helperServer.before());
afterAll(helperServer.after);
beforeEach(async () => {
  await execute(sql.clear);
});

async function conversation() {
  const user = await selectOrInsertUserByUid('course-agent-admission@example.com');
  const course = await queryRow(sql.course, z.object({ id: z.string() }));
  return createConversation(
    { course_id: course.id, user_id: user.id, authn_user_id: user.id },
    {
      title: 'Admission',
      repository: 'example/course',
      branch: 'main',
    },
  );
}
const empty = { messages: [], operationNumber: 0, executions: {} };

function receipts(id: string, dispatchId: string, status: 'running' | 'completed' = 'completed') {
  return {
    ...empty,
    executions: {
      [id]: { dispatchId, status, model: 'fixture', input: 100, cached: 0, output: 10 },
    },
  };
}

function mockProvider() {
  const original = provider.createCloudflareProvider;
  return vi.spyOn(provider, 'createCloudflareProvider').mockImplementation((...args) => ({
    ...original(...args),
    getSnapshot: async () => empty,
    reconcileAdmissions: async (admissions) => ({
      rejected: admissions.map((row) => row.dispatchId),
    }),
  }));
}
it('accounts for an identical operation ID independently in each conversation', async () => {
  const source = await conversation(),
    target = await conversation();
  const id = randomUUID();
  const mocked = mockProvider();
  try {
    await withConfig({ courseAgent: settings }, async () => {
      await admit(source, { id, text: 'first', expectedOperationNumber: 0 });
      await recordUsage(
        source,
        receipts(id, (await selectOptionalExecution(source.id, id))!.dispatch_id),
      );
      await admit(target, { id, text: 'second', expectedOperationNumber: 0 });
      const receipt = (await selectOptionalExecution(target.id, id))!;
      expect(receipt.status).toBe('admitted');
      expect((await selectActiveExecution(target.id)).active).toBe(true);
      expect((await recordUsage(target, receipts(id, receipt.dispatch_id))).input).toBe(100);
    });
  } finally {
    mocked.mockRestore();
  }
});
it('checks capacity again on a rejected-send retry and ignores an earlier dispatch receipt', async () => {
  const source = await conversation(),
    target = await conversation();
  const input = { id: randomUUID(), text: 'retry', expectedOperationNumber: 0 };
  const other = { id: randomUUID(), text: 'other', expectedOperationNumber: 0 };
  const mocked = mockProvider();
  try {
    await withConfig({ courseAgent: settings }, async () => {
      await admit(source, input);
      const original = (await selectOptionalExecution(source.id, input.id))!;
      await rejectExecution(source.id, input.id, original.dispatch_id);
      await admit(target, other);
      await expect(admit(source, input)).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
      await recordUsage(
        target,
        receipts(other.id, (await selectOptionalExecution(target.id, other.id))!.dispatch_id),
      );
      await admit(source, input);
      const retry = (await selectOptionalExecution(source.id, input.id))!;
      expect(retry.dispatch_id).not.toBe(original.dispatch_id);
      await rejectExecution(source.id, input.id, original.dispatch_id);
      await recordUsage(source, receipts(input.id, original.dispatch_id));
      expect((await selectOptionalExecution(source.id, input.id))!.status).toBe('admitted');
      await recordUsage(source, receipts(input.id, retry.dispatch_id, 'running'));
      expect((await selectActiveExecution(source.id)).active).toBe(true);
    });
  } finally {
    mocked.mockRestore();
  }
});
it('releases a missing execution only after the Worker fences its dispatch', async () => {
  const source = await conversation(),
    target = await conversation();
  const input = { id: randomUUID(), text: 'not received', expectedOperationNumber: 0 };
  const mocked = mockProvider();
  try {
    await withConfig({ courseAgent: settings }, async () => {
      await admit(source, input);
      await execute(sql.age, { conversation_id: source.id });
      await recordUsage(source, empty);
      expect((await selectOptionalExecution(source.id, input.id))!.status).toBe('failed');
      await admit(target, {
        id: randomUUID(),
        text: 'capacity released',
        expectedOperationNumber: 0,
      });
      expect((await selectActiveExecution(target.id)).active).toBe(true);
    });
  } finally {
    mocked.mockRestore();
  }
});
it('admits concurrent work with a single-client named-lock pool', async () => {
  const conversations = await Promise.all(Array.from({ length: 12 }, () => conversation()));
  const mocked = mockProvider();
  const lockConfig = {
    user: 'postgres',
    host: 'localhost',
    database: helperDb.getDatabaseNameForCurrentWorker(),
    max: 1,
  };
  await namedLocks.close();
  await namedLocks.init(lockConfig, (error) => {
    throw error;
  });
  try {
    await withConfig(
      { courseAgent: { ...settings, maxConcurrentPerUser: 20, maxConcurrentPerCourse: 20 } },
      async () => {
        await Promise.all(
          conversations.map((c) =>
            admit(c, { id: randomUUID(), text: 'parallel', expectedOperationNumber: 0 }),
          ),
        );
        expect(
          (await Promise.all(conversations.map((c) => selectActiveExecution(c.id)))).every(
            (row) => row.active,
          ),
        ).toBe(true);
      },
    );
  } finally {
    mocked.mockRestore();
    await namedLocks.close();
    await namedLocks.init({ ...lockConfig, max: 10 }, (error) => {
      throw error;
    });
  }
});

it('keeps an unavailable conversation reserved without blocking spare course capacity', async () => {
  const source = await conversation(),
    target = await conversation();
  const original = provider.createCloudflareProvider;
  const captured = vi.spyOn(Sentry, 'captureException').mockReturnValue('event');
  const mocked = vi.spyOn(provider, 'createCloudflareProvider').mockImplementation((...args) => ({
    ...original(...args),
    getSnapshot: async () => {
      throw new ChatError(502, 'Worker unavailable');
    },
  }));
  try {
    await withConfig(
      { courseAgent: { ...settings, maxConcurrentPerUser: 2, maxConcurrentPerCourse: 2 } },
      async () => {
        await admit(source, { id: randomUUID(), text: 'source', expectedOperationNumber: 0 });
        await admit(target, { id: randomUUID(), text: 'target', expectedOperationNumber: 0 });
        expect((await selectActiveExecution(source.id)).active).toBe(true);
        expect((await selectActiveExecution(target.id)).active).toBe(true);
        expect(captured).toHaveBeenCalledOnce();
      },
    );
  } finally {
    mocked.mockRestore();
    captured.mockRestore();
  }
});
it('blocks unknown completed cost until the saved usage has a configured price', async () => {
  const source = await conversation(),
    target = await conversation();
  const input = { id: randomUUID(), text: 'source', expectedOperationNumber: 0 };
  const mocked = mockProvider();
  try {
    await withConfig({ courseAgent: settings }, async () => {
      await admit(source, input);
      const snapshot = receipts(
        input.id,
        (await selectOptionalExecution(source.id, input.id))!.dispatch_id,
      );
      snapshot.executions[input.id].model = 'unpriced-model';
      await recordUsage(source, snapshot);
      await expect(
        admit(target, { id: randomUUID(), text: 'blocked', expectedOperationNumber: 0 }),
      ).rejects.toThrow('unknown cost');
      await withConfig(
        {
          courseAgent: {
            ...settings,
            pricing: { 'unpriced-model': { input: 1, cachedInput: 0.1, output: 1 } },
          },
        },
        async () => {
          await recordUsage(source, snapshot);
          await admit(target, { id: randomUUID(), text: 'priced', expectedOperationNumber: 0 });
          expect((await selectActiveExecution(target.id)).active).toBe(true);
        },
      );
    });
  } finally {
    mocked.mockRestore();
  }
});
