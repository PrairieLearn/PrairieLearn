import { randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';

import { type ModelReservation, type ServiceScope } from '@prairielearn/course-agent-contract';

import { AgentAccounting } from './accounting.js';

const redis = new Redis<'legacy'>('redis://localhost:6379');
const key = `course-agent-accounting-test:${randomUUID()}`;
const epoch = randomUUID();
const policy = {
  epoch,
  hourly: 10000,
  turn: 2000,
  request: 1000,
  concurrency: 2,
  runtime: 1800000,
  tools: 100,
  requests: 200,
};
const ledger = new AgentAccounting(redis, key, policy);
const scope: ServiceScope = {
  conversationId: randomUUID(),
  courseId: '1',
  userId: '1',
  authnUserId: '1',
};
const prices = { input: 1, cachedInput: 0.5, cacheWrite: 1.5, output: 1 };
let actionId: string;
const stateSchema = z.object({
  hours: z.record(z.string(), z.number()),
  actions: z.record(z.string(), z.object({ cost: z.number(), active: z.boolean() })),
  requests: z.record(
    z.string(),
    z.object({
      maximum: z.number(),
      status: z.string(),
      hour: z.string().optional(),
      actual: z.number().optional(),
    }),
  ),
});

async function state() {
  return stateSchema.parse(await ledger.status(scope));
}

function request(): ModelReservation {
  return {
    modelRequestId: randomUUID(),
    actionId,
    capacityGrantId: actionId,
    requestDigest: 'a'.repeat(64),
    model: 'fixture',
    inputTokenUpperBound: 100,
    requestedMaxOutputTokens: 1000,
    createdAt: Date.now(),
  };
}
beforeEach(async () => {
  await redis.del(key);
  const info = await redis.info('server');
  await redis.hset(key, 'epoch', epoch, 'server_run_id', /run_id:(\w+)/.exec(info)![1]);
  actionId = randomUUID();
  await ledger.authorize(scope, { actionId, commandId: actionId, createdAt: Date.now() });
});
afterAll(async () => {
  await redis.del(key);
  await ledger.close();
});

it('atomically limits parallel conversations across courses', async () => {
  const results = await Promise.allSettled(
    [2, 3].map((courseId) => {
      const id = randomUUID();
      return ledger.authorize(
        { ...scope, courseId: String(courseId), conversationId: randomUUID() },
        { actionId: id, commandId: id, createdAt: Date.now() },
      );
    }),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  await ledger.release(scope, actionId);
  const id = randomUUID();
  await expect(
    ledger.authorize(
      { ...scope, conversationId: randomUUID() },
      { actionId: id, commandId: id, createdAt: Date.now() },
    ),
  ).resolves.toMatchObject({ actionId: id });
});

it('bounds parallel requests before dispatch and preserves the turn budget across steering', async () => {
  const results = await Promise.allSettled(
    [request(), request(), request()].map((input) => ledger.reserve(scope, input, prices)),
  );
  const granted = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  expect(granted).toHaveLength(2);
  expect(granted.reduce((sum, g) => sum + g.reservedCostUnits, 0)).toBe(2000);
  expect(granted[0].maxOutputTokens).toBe(850);
  await expect(
    ledger.authorize(scope, { actionId, commandId: randomUUID(), createdAt: Date.now() }),
  ).rejects.toMatchObject({ code: 'turn_limit' });
  await ledger.settle(scope, {
    kind: 'measured',
    reservationId: granted[0].reservationId,
    responseId: 'response-1',
    usage: { input: 100, cached: 0, cacheWrite: 0, output: 100 },
  });
  expect((await ledger.reserve(scope, request(), prices)).reservedCostUnits).toBe(800);
  expect((await state()).actions[actionId].cost).toBe(2000);
});

it('settles once, rejects changed receipts, and uses pinned prices', async () => {
  const input = request();
  const grant = await ledger.reserve(scope, input, prices);
  expect(await ledger.reserve(scope, input, { ...prices, output: 99 })).toEqual(grant);
  const settlement = {
    kind: 'measured' as const,
    reservationId: grant.reservationId,
    responseId: 'response-2',
    usage: { input: 100, cached: 50, cacheWrite: 0, output: 100 },
  };
  await Promise.all([ledger.settle(scope, settlement), ledger.settle(scope, settlement)]);
  const hour = String(Math.floor(Date.now() / 3600000));
  expect((await state()).hours[hour]).toBe(175);
  await expect(
    ledger.settle(scope, { ...settlement, responseId: 'different' }),
  ).rejects.toMatchObject({ code: 'settlement_conflict' });
  await expect(
    ledger.settle(scope, { ...settlement, usage: { ...settlement.usage, input: 99, cached: 48 } }),
  ).rejects.toMatchObject({ code: 'settlement_conflict' });
  await expect(
    ledger.reserve(scope, { ...input, requestDigest: 'b'.repeat(64) }, prices),
  ).rejects.toMatchObject({ code: 'identity_conflict' });
  await expect(ledger.settle({ ...scope, authnUserId: '2' }, settlement)).rejects.toMatchObject({
    code: 'identity_conflict',
  });
});

it('retains unknown cost across hours and applies its correction only to the original charge hour', async () => {
  const input = request();
  const grant = await ledger.reserve(scope, input, prices);
  await ledger.settle(scope, { kind: 'unknown', reservationId: grant.reservationId });
  const stored = JSON.parse((await redis.hget(key, `user:${scope.userId}`))!);
  const hour = String(Math.floor(Date.now() / 3600000));
  const previous = String(Number(hour) - 1);
  stored.hours[previous] = stored.hours[hour];
  delete stored.hours[hour];
  stored.requests[grant.reservationId].hour = previous;
  await redis.hset(key, `user:${scope.userId}`, JSON.stringify(stored));
  const next = await ledger.reserve(scope, request(), prices);
  const usage = { input: 100, cached: 0, cacheWrite: 0, output: 100 };
  await ledger.settle(scope, {
    kind: 'measured',
    reservationId: next.reservationId,
    responseId: 'new-hour',
    usage,
  });
  await ledger.settle(scope, {
    kind: 'measured',
    reservationId: grant.reservationId,
    responseId: 'old-hour',
    usage,
  });
  expect((await state()).hours).toMatchObject({ [previous]: 200, [hour]: 200 });
  expect((await state()).actions[actionId].cost).toBe(400);
});

it('carries outstanding escrow into the current hour and fails closed on a changed Redis process', async () => {
  const input = request();
  const restricted = new AgentAccounting(redis, key, { ...policy, hourly: 1000 });
  await restricted.reserve(scope, input, prices);
  await ledger.release(scope, actionId);
  const id = randomUUID();
  await expect(
    restricted.authorize(scope, { actionId: id, commandId: id, createdAt: Date.now() }),
  ).rejects.toMatchObject({ code: 'hourly_limit' });
  await redis.hset(key, 'server_run_id', 'previous-process');
  await expect(ledger.reserve(scope, request(), prices)).rejects.toMatchObject({ status: 503 });
});

it('does not let a delayed release remove the slot of a cold continuation', async () => {
  await ledger.release(scope, actionId);
  const continuation = randomUUID();
  const grant = await ledger.authorize(scope, {
    actionId,
    commandId: continuation,
    createdAt: Date.now(),
  });
  expect(grant.id).toBe(continuation);
  await ledger.release(scope, actionId, actionId);
  expect((await state()).actions[actionId].active).toBe(true);
  await ledger.release(scope, actionId, continuation);
  expect((await state()).actions[actionId].active).toBe(false);
});
