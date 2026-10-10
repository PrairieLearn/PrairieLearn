import { readFile } from 'node:fs/promises';

import { Redis } from 'ioredis';
import { z } from 'zod';

import {
  ChatError,
  type ModelPrice,
  type ModelReservation,
  type ModelSettlement,
  type ServiceScope,
  executionGrantSchema,
  modelGrantSchema,
} from '@prairielearn/course-agent-contract';
import { logger } from '@prairielearn/logger';

import { config } from '../../../lib/config.js';

const script = readFile(new URL('accounting.lua', import.meta.url), 'utf8');
const units = (dollars: number) => Math.floor(dollars * 1_000_000);
const binding = (scope: ServiceScope) =>
  JSON.stringify([scope.conversationId, scope.courseId, scope.userId, scope.authnUserId]);
export interface AccountingPolicy {
  epoch: string;
  hourly: number;
  turn: number;
  request: number;
  concurrency: number;
  runtime: number;
  tools: number;
  requests: number;
}

export class AgentAccounting {
  constructor(
    private redis: Redis<'legacy'>,
    private key: string,
    private policy: AccountingPolicy,
  ) {}

  private async command(scope: ServiceScope, command: object) {
    const raw = await this.redis.eval(
      await script,
      1,
      this.key,
      this.policy.epoch,
      scope.userId,
      JSON.stringify({ ...command, binding: binding(scope), conversation: scope.conversationId }),
      JSON.stringify(this.policy),
    );
    const result = z
      .object({ error: z.string().optional(), value: z.unknown().optional() })
      .parse(JSON.parse(z.string().parse(raw)));
    if (result.error) {
      const errors: Record<string, [number, string]> = {
        accounting_unavailable: [
          503,
          'Course agent spending checks are temporarily unavailable. Your draft and history are saved. Contact your administrator if this persists.',
        ],
        capacity_limit: [
          429,
          'You have reached the active conversation limit. Stop another conversation before continuing.',
        ],
        hourly_limit: [
          429,
          'Your hourly spending limit is reached. Try again after the next UTC hour.',
        ],
        turn_limit: [
          429,
          'This turn reached its spending or execution limit. Your history is saved. Send a new message to start another turn.',
        ],
        budget_limit: [
          429,
          'This request cannot fit the remaining allowance. Use a shorter request or start a new turn.',
        ],
        identity_conflict: [
          409,
          'The saved request does not match this retry. Refresh the conversation before continuing.',
        ],
        settlement_conflict: [409, 'The usage receipt changed. Contact your administrator.'],
        admission_expired: [
          409,
          'This request expired before starting. Your draft is saved. Send it as a new message.',
        ],
        conversation_busy: [
          429,
          'This conversation is still stopping earlier work. Wait for confirmed completion.',
        ],
        capacity_required: [
          429,
          'This turn is no longer authorized. Send a new message to continue.',
        ],
        receipt_retention_limit: [
          429,
          'Usage reconciliation is pending. Contact your administrator before continuing.',
        ],
        usage_exceeds_reservation: [
          503,
          'Model usage exceeded its verified allowance. New work is paused; contact your administrator.',
        ],
      };
      const [status, message] = errors[result.error] ?? errors.accounting_unavailable;
      throw new ChatError(status, message, result.error);
    }
    return result.value;
  }

  async authorize(
    scope: ServiceScope,
    input: { actionId: string; commandId: string; createdAt: number },
  ) {
    return executionGrantSchema.parse(await this.command(scope, { kind: 'authorize', ...input }));
  }

  async release(scope: ServiceScope, actionId: string, grantId = actionId) {
    await this.command(scope, { kind: 'release', actionId, grantId });
  }

  async reserve(scope: ServiceScope, input: ModelReservation, prices: ModelPrice) {
    if (
      Object.values(prices).some((price) => !Number.isFinite(price) || price < 0) ||
      prices.output <= 0
    ) {
      throw new ChatError(503, 'Model pricing is unavailable.');
    }
    return modelGrantSchema.parse(
      await this.command(scope, {
        kind: 'reserve',
        ...input,
        digest: JSON.stringify(input),
        prices,
        inputPrice: Math.max(prices.input, prices.cachedInput, prices.cacheWrite),
        outputPrice: prices.output,
      }),
    );
  }

  async lookup(scope: ServiceScope, input: ModelReservation) {
    return modelGrantSchema.nullable().parse(
      await this.command(scope, {
        kind: 'lookup',
        modelRequestId: input.modelRequestId,
        digest: JSON.stringify(input),
      }),
    );
  }

  async settle(scope: ServiceScope, input: ModelSettlement) {
    await this.command(scope, { ...input, kind: 'settle', settlement: input.kind });
  }

  async status(scope: ServiceScope) {
    return this.command(scope, { kind: 'status' });
  }

  async close() {
    await this.redis.quit();
  }
}

let accounting: AgentAccounting | undefined;
export function getAgentAccounting() {
  if (accounting) return accounting;
  const settings = config.courseAgent;
  if (!settings || !config.nonVolatileRedisUrl) {
    throw new ChatError(503, 'Course agent accounting is unavailable.');
  }
  const redis = new Redis<'legacy'>(config.nonVolatileRedisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 10000,
    commandTimeout: 10000,
  });
  redis.on('error', (error) => logger.error('Course agent accounting Redis error', error));
  accounting = new AgentAccounting(redis, `${config.cacheKeyPrefix}course-agent:ledger`, {
    epoch: settings.accountingEpoch,
    hourly: units(settings.hourlyCostLimit),
    turn: units(settings.turnCostLimit),
    request: units(settings.requestCostLimit),
    concurrency: settings.maxConcurrentPerUser,
    runtime: settings.maxTurnRuntimeMs,
    tools: settings.maxToolCallsPerTurn,
    requests: settings.maxModelRequestsPerTurn,
  });
  return accounting;
}
export async function closeAgentAccounting() {
  await accounting?.close();
  accounting = undefined;
}
