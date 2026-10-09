import { TRPCError } from '@trpc/server';
import { Redis } from 'ioredis';

import type { ChatProvider, ChatSnapshot, SendRequest } from '@prairielearn/course-agent-contract';
import { logger } from '@prairielearn/logger';
import { execute, loadSqlEquiv, runInTransactionAsync } from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
import type { CourseAgentConversation } from '../../../lib/db-types.js';
import { RedisRateLimiter } from '../../../lib/redis-rate-limiter.js';
import {
  reserveContinuation,
  reserveOperation,
  saveConversationUsage,
  selectConversationForUpdate,
  selectOptionalOperation,
  selectUserAccountingConversations,
  selectUserCapacity,
} from '../../../models/course-agent-conversation.js';

import { reconcileOperations } from './lifecycle.js';
import { createCloudflareProvider } from './provider.js';

const sql = loadSqlEquiv(import.meta.url);
export const rateLimiter = new RedisRateLimiter({
  redis: () => {
    if (!config.nonVolatileRedisUrl) {
      throw new Error('Non-volatile Redis is required for course-agent accounting.');
    }
    const redis = new Redis<'legacy'>(config.nonVolatileRedisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 10000,
      commandTimeout: 10000,
    });
    redis.on('error', (error) => logger.error('Course agent Redis error', error));
    return redis;
  },
  keyPrefix: () => `${config.cacheKeyPrefix}course-agent:`,
  intervalSeconds: 3600,
});
export function modelPricing(model: string) {
  const prices: Partial<Record<string, (typeof config.costPerMillionTokens)['gpt-6-astra']>> =
    config.costPerMillionTokens;
  return prices[model];
}
export function estimatedCost(
  usage: ChatSnapshot['conversationUsage'],
  price: ReturnType<typeof modelPricing> | null,
) {
  if (!usage || !price) return null;
  return (
    ((usage.input - usage.cached - usage.cacheWrite) * price.input +
      usage.cached * price.cachedInput +
      usage.cacheWrite * price.cacheWrite +
      usage.output * price.output) /
    1_000_000
  );
}
/** Save absolute conversation usage, then apply its new cost to the existing hourly limiter. */
export async function recordUsage(conversation: CourseAgentConversation, snapshot: ChatSnapshot) {
  const usage = snapshot.conversationUsage;
  if (!usage) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Course agent usage is unavailable. Reconnect before starting more work.',
    });
  }
  // Pin rates under the same row lock as the snapshot, including concurrent first reports.
  const { saved, delta } = await runInTransactionAsync(async () => {
    conversation = await selectConversationForUpdate(conversation.id);
    const price =
      conversation.usage_input_price === null
        ? (modelPricing(usage.model) ?? null)
        : {
            input: conversation.usage_input_price,
            cachedInput: conversation.usage_cache_read_price!,
            cacheWrite: conversation.usage_cache_write_price!,
            output: conversation.usage_output_price!,
          };
    if (conversation.usage_model !== null && conversation.usage_model !== usage.model) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'The conversation model changed. Start a new conversation.',
      });
    }
    const cost = estimatedCost(usage, price);
    const saved = await saveConversationUsage(conversation.id, {
      usage_model: usage.model,
      usage_version: usage.version,
      usage_input_tokens: usage.input,
      usage_input_tokens_cache_read: usage.cached,
      usage_input_tokens_cache_write: usage.cacheWrite,
      usage_output_tokens: usage.output,
      usage_cost: cost,
      usage_input_price: price?.input ?? null,
      usage_cache_read_price: price?.cachedInput ?? null,
      usage_cache_write_price: price?.cacheWrite ?? null,
      usage_output_price: price?.output ?? null,
    });
    return { saved, delta: (saved.usage_cost ?? 0) - (conversation.usage_cost ?? 0) };
  });
  // The database commits first. If Redis fails, this delta is not retried:
  // conversation accounting stays accurate, but the soft hourly limit can undercount.
  if (delta > 0) {
    await rateLimiter.addToIntervalUsage(`user:${saved.user_id}`, delta);
  }
  return {
    input: saved.usage_input_tokens,
    output: saved.usage_output_tokens,
    estimatedCost: saved.usage_cost,
  };
}

/** Reconcile the user's unobserved work on admission, without keeping detached watchers. */
async function refreshUser(conversation: CourseAgentConversation) {
  const settings = config.courseAgent!;
  const rows = await selectUserAccountingConversations(conversation.user_id);
  for (let offset = 0; offset < rows.length; offset += 5) {
    const results = await Promise.allSettled(
      rows.slice(offset, offset + 5).map(async (c) => {
        const chat = createCloudflareProvider(new URL(settings.workerUrl), c.external_id);
        const state = await chat.getSnapshot(AbortSignal.timeout(10000));
        await reconcileOperations(c, chat, state);
        await recordUsage(c, state);
      }),
    );
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  }
}

async function withAdmissionLock<T>(
  conversation: CourseAgentConversation,
  action: () => Promise<T>,
) {
  return runInTransactionAsync(async () => {
    await execute(sql.lock_timeout);
    await execute(sql.lock_user, { user_id: conversation.user_id });
    return action();
  });
}

async function checkCapacity(conversation: CourseAgentConversation) {
  const stats = await selectUserCapacity(conversation.user_id, conversation.id);
  if (stats.unknown) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'Previous course agent usage has an unknown cost. Reconcile its usage or model pricing before starting more work.',
    });
  }
  if (
    (await rateLimiter.getIntervalUsage(`user:${conversation.user_id}`)) >=
      config.courseAgent!.hourlyCostLimit ||
    (!stats.current_active && stats.active >= config.courseAgent!.maxConcurrentPerUser)
  ) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Course agent usage limit reached. Try again later.',
    });
  }
}
export async function admit(
  conversation: CourseAgentConversation,
  input: SendRequest,
  chat: ChatProvider,
) {
  await refreshUser(conversation);
  const state = await chat.getSnapshot(AbortSignal.timeout(10000));
  await reconcileOperations(conversation, chat, state);
  await recordUsage(conversation, state);
  return withAdmissionLock(conversation, async () => {
    const existing = await selectOptionalOperation(conversation.id, input.id);
    // A retry already accepted/admitted must preserve identity even when its cost now exceeds the threshold.
    if (!existing || existing.status === 'rejected') await checkCapacity(conversation);
    return reserveOperation(
      conversation,
      input.id,
      { kind: 'message', text: input.text },
      input.expectedOperationNumber,
    );
  });
}
/** Already-running turns finish; only a cold continuation needs another admission. */
export async function admitResult(
  conversation: CourseAgentConversation,
  id: string,
  snapshot: ChatSnapshot,
) {
  if (Object.values(snapshot.executions ?? {}).some((receipt) => receipt.status === 'running')) {
    return undefined;
  }
  await refreshUser(conversation);
  return withAdmissionLock(conversation, async () => {
    const existing = await selectOptionalOperation(conversation.id, id);
    if (!existing || ['rejected', 'failed', 'cancelled', 'interrupted'].includes(existing.status)) {
      await checkCapacity(conversation);
    }
    return reserveContinuation(conversation, id);
  });
}
