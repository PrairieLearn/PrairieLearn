import { TRPCError } from '@trpc/server';

import {
  ChatError,
  type ChatSnapshot,
  type SendRequest,
} from '@prairielearn/course-agent-contract';
import { execute, loadSqlEquiv, runInTransactionAsync } from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

import { config } from '../../../lib/config.js';
import { type CourseAgentConversation } from '../../../lib/db-types.js';
import { reserveOperation } from '../../../models/course-agent-conversation.js';
import * as executions from '../../../models/course-agent-execution.js';

import { createCloudflareProvider } from './provider.js';

const sql = loadSqlEquiv(import.meta.url);
const ADMISSION_RECONCILIATION_MS = 2 * 60_000;

export function modelPricing(model: string) {
  return (
    config.courseAgent?.pricing[model] ??
    (
      config.costPerMillionTokens as Partial<
        Record<string, { input: number; cachedInput: number; cacheWrite: number; output: number }>
      >
    )[model]
  );
}
export function estimatedCost(
  usage: {
    input: number | null;
    cached: number | null;
    cacheWrite?: number | null;
    output: number | null;
  },
  price: { input: number; cachedInput: number; cacheWrite?: number; output: number } | undefined,
) {
  if (
    price?.input === 0 &&
    price.cachedInput === 0 &&
    price.cacheWrite === 0 &&
    price.output === 0
  ) {
    return 0;
  }
  if (
    price?.cacheWrite === undefined ||
    usage.input === null ||
    usage.output === null ||
    usage.cached === null ||
    usage.cacheWrite == null
  ) {
    return null;
  }
  // Codex includes cache reads and writes in inputTokens; each subset has its own rate.
  return (
    ((usage.input - usage.cached - usage.cacheWrite) * price.input +
      usage.cached * price.cachedInput +
      usage.cacheWrite * price.cacheWrite +
      usage.output * price.output) /
    1_000_000
  );
}
export async function recordUsage(conversation: CourseAgentConversation, snapshot: ChatSnapshot) {
  const stored = await executions.selectExecutions(conversation.id);
  const absent = stored.filter(
    (row) =>
      !snapshot.executions?.[row.operation_id] &&
      (['admitted', 'running'].includes(row.status) ||
        (row.model !== null && row.estimated_cost === null)),
  );
  if (absent.length > 0) {
    const settings = config.courseAgent!;
    const chat = createCloudflareProvider(new URL(settings.workerUrl), conversation.external_id);
    for (let offset = 0; offset < absent.length; offset += 100) {
      const ids = absent.slice(offset, offset + 100).map((row) => row.operation_id);
      const saved = await chat.getSnapshot(AbortSignal.timeout(10000), ids);
      snapshot = { ...snapshot, executions: { ...snapshot.executions, ...saved.executions } };
    }
  }
  const missing = stored.filter((row) => {
    const receipt = snapshot.executions?.[row.operation_id];
    return (
      row.status === 'admitted' &&
      (!receipt || (receipt.dispatchId && receipt.dispatchId !== row.dispatch_id)) &&
      row.admitted_at.getTime() < Date.now() - ADMISSION_RECONCILIATION_MS
    );
  });
  if (missing.length > 0) {
    const settings = config.courseAgent!;
    const chat = createCloudflareProvider(new URL(settings.workerUrl), conversation.external_id);
    // The Worker fences this dispatch before acknowledging rejection. A missing snapshot alone
    // cannot prove that a delayed request will never start.
    for (let offset = 0; offset < missing.length; offset += 100) {
      const batch = missing.slice(offset, offset + 100);
      const { rejected } = await chat.reconcileAdmissions(
        batch.map((row) => ({ id: row.operation_id, dispatchId: row.dispatch_id })),
        AbortSignal.timeout(10000),
      );
      for (const row of batch) {
        if (rejected.includes(row.dispatch_id)) {
          await executions.rejectExecution(conversation.id, row.operation_id, row.dispatch_id);
        }
      }
    }
  }
  const updates: Parameters<typeof executions.saveExecutions>[1] = [];
  for (const existing of stored) {
    const value = snapshot.executions?.[existing.operation_id];
    if (!value || (value.dispatchId && value.dispatchId !== existing.dispatch_id)) continue;
    if (value.status === 'running' && !['admitted', 'running'].includes(existing.status)) continue;
    const price =
      (existing.pricing as {
        input: number;
        cachedInput: number;
        cacheWrite?: number;
        output: number;
      } | null) ?? modelPricing(value.model);
    const cost = estimatedCost(value, price);
    if (
      existing.status === value.status &&
      existing.model === value.model &&
      (value.input === null ||
        (existing.input_tokens !== null && existing.input_tokens >= value.input)) &&
      (value.cached === null ||
        (existing.cached_input_tokens !== null && existing.cached_input_tokens >= value.cached)) &&
      (value.output === null ||
        (existing.output_tokens !== null && existing.output_tokens >= value.output)) &&
      (cost === null
        ? existing.estimated_cost === null
        : existing.estimated_cost !== null && existing.estimated_cost >= cost)
    ) {
      continue;
    }
    updates.push({
      operation_id: existing.operation_id,
      dispatch_id: existing.dispatch_id,
      status: value.status,
      input: value.input,
      cached: value.cached,
      output: value.output,
      cost,
      model: value.model,
      pricing: price ?? null,
    });
  }
  if (updates.length > 0) await executions.saveExecutions(conversation.id, updates);
  return executions.selectUsageSummary(conversation.id);
}

async function withAdmissionLocks<T>(
  conversation: CourseAgentConversation,
  action: () => Promise<T>,
) {
  return runInTransactionAsync(async () => {
    // Always acquire course then user on this transaction's single client. Nested named locks
    // each check out another client and can exhaust their shared pool.
    await execute(sql.lock_timeout);
    await execute(sql.lock_course, { course_id: conversation.course_id });
    await execute(sql.lock_user, { user_id: conversation.user_id });
    return action();
  });
}

async function checkCapacity(conversation: CourseAgentConversation, message: boolean) {
  const settings = config.courseAgent!;
  const stats = await executions.selectUsageStats(conversation.course_id, conversation.user_id);
  const active = await executions.selectActiveExecution(conversation.id);
  const recent = message ? await executions.selectRecentRequests(conversation.user_id) : undefined;
  if (stats.user_unknown_cost > 0 || stats.course_unknown_cost > 0) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'Previous course agent usage has an unknown cost. Ask an administrator to reconcile its usage or model pricing before starting more work.',
    });
  }
  if (
    (recent && recent.requests > settings.maxRequestsPerHour) ||
    stats.user_cost >= settings.dailyCostLimit ||
    stats.course_cost >= settings.dailyCostLimit ||
    (!active.active &&
      (stats.user_active >= settings.maxConcurrentPerUser ||
        stats.course_active >= settings.maxConcurrentPerCourse))
  ) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Course agent usage limit reached. Try again later.',
    });
  }
}
export async function admit(conversation: CourseAgentConversation, input: SendRequest) {
  const settings = config.courseAgent!;
  const active = await executions.selectActiveConversations(
    conversation.course_id,
    conversation.user_id,
  );
  // An unreachable Worker keeps its slot; it must not veto unrelated work with spare capacity.
  for (let offset = 0; offset < active.length; offset += 5) {
    const results = await Promise.allSettled(
      active.slice(offset, offset + 5).map(async (c) => {
        const chat = createCloudflareProvider(new URL(settings.workerUrl), c.external_id);
        try {
          await recordUsage(c, await chat.getSnapshot(AbortSignal.timeout(10000)));
        } catch (error) {
          if (!(error instanceof ChatError)) throw error;
          Sentry.captureException(error);
        }
      }),
    );
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  }
  return withAdmissionLocks(conversation, async () => {
    const operationNumber = await reserveOperation(
      conversation,
      input.id,
      { kind: 'message', text: input.text },
      input.expectedOperationNumber,
    );
    const existing = await executions.selectOptionalExecution(conversation.id, input.id);
    if (existing && !(existing.status === 'failed' && existing.model === null)) {
      return operationNumber;
    }
    await checkCapacity(conversation, true);
    await executions.insertExecution(conversation.id, input.id);
    return operationNumber;
  });
}

/** A cold continuation consumes a new execution slot; warm results continue their admitted turn. */
export async function admitResult(
  conversation: CourseAgentConversation,
  id: string,
  snapshot: ChatSnapshot,
) {
  if (Object.values(snapshot.executions ?? {}).some((value) => value.status === 'running')) {
    return undefined;
  }
  return withAdmissionLocks(conversation, async () => {
    const existing = await executions.selectOptionalExecution(conversation.id, id);
    if (!existing || ['failed', 'cancelled', 'interrupted'].includes(existing.status)) {
      await checkCapacity(conversation, false);
      await executions.insertExecution(conversation.id, id, true);
    }
    return (await executions.selectOptionalExecution(conversation.id, id))!.dispatch_id;
  });
}
