import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { ChatSnapshot } from '@prairielearn/course-agent-contract';
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { reconcileOperations } from '../ee/lib/course-agent/lifecycle.js';
import * as providers from '../ee/lib/course-agent/provider.js';
import { admit, estimatedCost, rateLimiter, recordUsage } from '../ee/lib/course-agent/usage.js';
import { config } from '../lib/config.js';
import {
  createConversation,
  selectConversation,
  selectOptionalOperation,
} from '../models/course-agent-conversation.js';
import { selectOrInsertUserByUid } from '../models/user.js';

import * as helperServer from './helperServer.js';
import { withConfig } from './utils/config.js';

const sql = loadSqlEquiv(import.meta.url);
beforeAll(helperServer.before());
afterAll(async () => {
  await rateLimiter.close();
  await helperServer.after();
});
const settings = {
  workerUrl: 'http://localhost:8791',
  serviceToken: 'local-fixture-service-token-not-a-secret',
  maxConcurrentPerUser: 1,
  hourlyCostLimit: 10,
};
const price = { input: 2, cachedInput: 0.5, cacheWrite: 3, output: 10 };
const empty: ChatSnapshot = {
  messages: [],
  operationNumber: 0,
  conversationUsage: {
    version: 0,
    model: 'gpt-6-astra',
    input: 0,
    cached: 0,
    cacheWrite: 0,
    output: 0,
  },
};

async function setup() {
  const user = await selectOrInsertUserByUid(`course-agent-accounting-${randomUUID()}@example.com`);
  const { id } = await queryRow(sql.course, z.object({ id: z.string() }));
  const scope = { course_id: id, user_id: user.id, authn_user_id: user.id };
  const conversation = await createConversation(scope, {
    title: 'Test',
    repository: 'org/course',
    branch: 'main',
  });
  return { scope, conversation };
}
it('stores cumulative totals, pins shared prices, and retries Redis after PostgreSQL succeeds', async () => {
  const { conversation, scope } = await setup();
  await withConfig(
    {
      courseAgent: settings,
      cacheKeyPrefix: randomUUID(),
      costPerMillionTokens: { ...config.costPerMillionTokens, 'gpt-6-astra': price },
    },
    async () => {
      const state: ChatSnapshot = {
        ...empty,
        conversationUsage: {
          version: 1,
          model: 'gpt-6-astra',
          input: 1000,
          cached: 200,
          cacheWrite: 100,
          output: 100,
        },
      };
      expect((await recordUsage(conversation, state)).estimatedCost).toBeCloseTo(0.0028);
      await recordUsage(conversation, state);
      await recordUsage(conversation, empty);
      expect(await rateLimiter.getIntervalUsage(`user:${conversation.user_id}`)).toBeCloseTo(
        0.0028,
      );
      const next: ChatSnapshot = {
        ...empty,
        conversationUsage: { ...state.conversationUsage!, version: 2, input: 2000 },
      };
      await withConfig(
        {
          costPerMillionTokens: {
            ...config.costPerMillionTokens,
            'gpt-6-astra': { ...price, input: 100 },
          },
        },
        async () => {
          const failure = vi
            .spyOn(rateLimiter, 'reconcileCumulativeUsage')
            .mockRejectedValueOnce(new Error('Redis unavailable'));
          await expect(recordUsage(conversation, next)).rejects.toThrow('Redis unavailable');
          expect((await selectConversation(scope, conversation.id)).usage!.version).toBe(2);
          failure.mockRestore();
          await recordUsage(conversation, next);
          await recordUsage(conversation, next);
          expect((await selectConversation(scope, conversation.id)).usage!.pricing).toEqual(price);
          expect(await rateLimiter.getIntervalUsage(`user:${conversation.user_id}`)).toBeCloseTo(
            0.0048,
          );
        },
      );
    },
  );
});
it('serializes concurrent admissions, allows identical retries, and blocks unknown usage and overspending', async () => {
  const { conversation: first, scope } = await setup();
  const second = await createConversation(scope, {
    title: 'Second',
    repository: 'org/course',
    branch: 'main',
  });
  const original = providers.createCloudflareProvider;
  const states = new Map<string, ChatSnapshot>([
    [first.external_id, empty],
    [second.external_id, empty],
  ]);
  const provider = vi
    .spyOn(providers, 'createCloudflareProvider')
    .mockImplementation((url, id) => ({
      ...original(url, id),
      getSnapshot: async () => states.get(id)!,
      reconcileAdmissions: async () => ({ rejected: [] }),
    }));
  try {
    await withConfig(
      {
        courseAgent: settings,
        cacheKeyPrefix: randomUUID(),
        costPerMillionTokens: { ...config.costPerMillionTokens, 'gpt-6-astra': price },
      },
      async () => {
        const inputs = [first, second].map(() => ({
          id: randomUUID(),
          text: 'Work',
          expectedOperationNumber: 0,
        }));
        const results = await Promise.allSettled(
          [first, second].map((c, i) =>
            admit(
              c,
              inputs[i],
              providers.createCloudflareProvider(new URL(settings.workerUrl), c.external_id),
            ),
          ),
        );
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const index = results.findIndex((result) => result.status === 'fulfilled');
        const winner = [first, second][index];
        const loser = [first, second][1 - index];
        const chat = providers.createCloudflareProvider(
          new URL(settings.workerUrl),
          winner.external_id,
        );
        expect(await admit(winner, inputs[index], chat)).toBe(1);
        const operation = (await selectOptionalOperation(winner.id, inputs[index].id))!;
        const receipt = {
          [operation.operation_id]: {
            dispatchId: operation.dispatch_id,
            status: 'completed' as const,
          },
        };
        const unknown: ChatSnapshot = {
          ...empty,
          executions: receipt,
          conversationUsage: { ...empty.conversationUsage!, version: 1, input: null },
        };
        states.set(winner.external_id, unknown);
        await reconcileOperations(winner, chat, unknown);
        await recordUsage(winner, unknown);
        await expect(
          admit(
            loser,
            inputs[1 - index],
            providers.createCloudflareProvider(new URL(settings.workerUrl), loser.external_id),
          ),
        ).rejects.toThrow('unknown cost');
        const costly: ChatSnapshot = {
          ...unknown,
          conversationUsage: { ...empty.conversationUsage!, version: 2, input: 6_000_000 },
        };
        states.set(winner.external_id, costly);
        await recordUsage(winner, costly);
        await expect(
          admit(
            loser,
            inputs[1 - index],
            providers.createCloudflareProvider(new URL(settings.workerUrl), loser.external_id),
          ),
        ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
        expect(await admit(winner, inputs[index], chat)).toBe(1);
      },
    );
  } finally {
    provider.mockRestore();
  }
});
it('does not treat unreported tokens as free usage even with zero prices', () => {
  expect(
    estimatedCost(
      { ...empty.conversationUsage!, input: null },
      { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
    ),
  ).toBeNull();
});
