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
  selectUserCapacity,
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
it('stores cumulative totals, pins shared prices, and accepts lost Redis increments', async () => {
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
      await Promise.all(Array.from({ length: 10 }, () => recordUsage(conversation, state)));
      await recordUsage(conversation, empty);
      await recordUsage(conversation, {
        ...state,
        conversationUsage: { ...state.conversationUsage!, version: 10, input: 0 },
      });
      expect((await selectConversation(scope, conversation.id)).usage_version).toBe(1);
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
            .spyOn(rateLimiter, 'addToIntervalUsage')
            .mockRejectedValueOnce(new Error('Redis unavailable'));
          await expect(recordUsage(conversation, next)).rejects.toThrow('Redis unavailable');
          expect((await selectConversation(scope, conversation.id)).usage_version).toBe(2);
          failure.mockRestore();
          expect((await selectConversation(scope, conversation.id)).usage_cost).toBeCloseTo(0.0048);
          await recordUsage(conversation, next);
          await recordUsage(conversation, next);
          expect(await selectConversation(scope, conversation.id)).toMatchObject({
            usage_input_price: price.input,
            usage_cache_read_price: price.cachedInput,
            usage_cache_write_price: price.cacheWrite,
            usage_output_price: price.output,
          });
          expect(await rateLimiter.getIntervalUsage(`user:${conversation.user_id}`)).toBeCloseTo(
            0.0028,
          );
        },
      );
    },
  );
});
it('charges only new usage after a pending report and across fixed-hour boundaries', async () => {
  const { conversation } = await setup();
  await withConfig(
    {
      courseAgent: settings,
      cacheKeyPrefix: randomUUID(),
      costPerMillionTokens: { ...config.costPerMillionTokens, 'gpt-6-astra': price },
    },
    async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        const hour = Math.floor(Date.now() / 3600000) * 3600000;
        vi.setSystemTime(hour + 1000);
        const first = {
          ...empty,
          conversationUsage: { ...empty.conversationUsage!, version: 1, input: 1000 },
        };
        await recordUsage(conversation, first);
        const pending = { ...first, conversationUsage: { ...first.conversationUsage, version: 2 } };
        expect((await recordUsage(conversation, pending)).estimatedCost).toBeCloseTo(0.002);
        vi.setSystemTime(hour + 3601000);
        await recordUsage(conversation, pending);
        expect(await rateLimiter.getIntervalUsage(`user:${conversation.user_id}`)).toBe(0);
        const next = {
          ...empty,
          conversationUsage: { ...empty.conversationUsage!, version: 3, input: 2000 },
        };
        await recordUsage(conversation, next);
        await recordUsage(conversation, first);
        await recordUsage(conversation, next);
        expect(await rateLimiter.getIntervalUsage(`user:${conversation.user_id}`)).toBeCloseTo(
          0.002,
        );
      } finally {
        vi.useRealTimers();
      }
    },
  );
});
it('serializes concurrent admissions, allows identical retries, and blocks overspending', async () => {
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
        const completed: ChatSnapshot = { ...empty, executions: receipt };
        states.set(winner.external_id, completed);
        await reconcileOperations(winner, chat, completed);
        const costly: ChatSnapshot = {
          ...completed,
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
it('starts with zero totals and keeps missing model pricing distinct from zero usage', async () => {
  const { conversation, scope } = await setup();
  expect(conversation).toMatchObject({
    usage_input_tokens: 0,
    usage_output_tokens: 0,
    usage_cost: 0,
  });
  expect(estimatedCost(empty.conversationUsage, price)).toBe(0);
  expect(estimatedCost(empty.conversationUsage, undefined)).toBeNull();
  const unpriced = {
    ...empty,
    conversationUsage: { ...empty.conversationUsage!, model: 'unpriced' },
  };
  expect((await recordUsage(conversation, unpriced)).estimatedCost).toBeNull();
  expect(await selectConversation(scope, conversation.id)).toMatchObject({
    usage_model: 'unpriced',
    usage_input_tokens: 0,
    usage_cost: null,
  });
  expect((await selectUserCapacity(conversation.user_id, conversation.id)).unknown).toBe(true);
});
