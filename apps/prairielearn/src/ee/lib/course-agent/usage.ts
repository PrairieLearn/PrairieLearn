import { TRPCError } from '@trpc/server';

import { type ChatSnapshot, type SendRequest } from '@prairielearn/course-agent-contract';
import * as namedLocks from '@prairielearn/named-locks';
import { runInTransactionAsync } from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
import { type CourseAgentConversation } from '../../../lib/db-types.js';
import {
  reserveOperation,
  selectOptionalOperation,
} from '../../../models/course-agent-conversation.js';
import * as executions from '../../../models/course-agent-execution.js';

import { createCloudflareProvider } from './provider.js';

export function estimatedCost(
  usage: { input: number | null; cached: number | null; output: number | null },
  price: { input: number; cachedInput: number; output: number } | undefined,
) {
  if (!price || usage.input === null || usage.output === null || usage.cached === null) return null;
  return (
    ((usage.input - usage.cached) * price.input +
      usage.cached * price.cachedInput +
      usage.output * price.output) /
    1_000_000
  );
}
export async function recordUsage(conversation: CourseAgentConversation, snapshot: ChatSnapshot) {
  for (const [id, value] of Object.entries(snapshot.executions ?? {})) {
    const existing = await executions.selectOptionalExecution(conversation.id, id);
    if (!existing) continue;
    const price =
      (existing.pricing as { input: number; cachedInput: number; output: number } | null) ??
      config.courseAgent?.pricing[value.model] ??
      (
        config.costPerMillionTokens as Partial<
          Record<string, { input: number; cachedInput: number; output: number }>
        >
      )[value.model];
    await executions.saveExecution({
      conversation_id: conversation.id,
      operation_id: id,
      status: value.status,
      input: value.input,
      cached: value.cached,
      output: value.output,
      cost: estimatedCost(value, price),
      model: value.model,
      pricing: price ? JSON.stringify(price) : null,
    });
  }
  return executions.selectUsageSummary(conversation.id);
}
export async function admit(conversation: CourseAgentConversation, input: SendRequest) {
  const settings = config.courseAgent!;
  // This reads execution receipts only; it never resumes work or publishes pending proposals.
  for (const active of await executions.selectActiveConversations(
    conversation.course_id,
    conversation.user_id,
  )) {
    const chat = createCloudflareProvider(new URL(settings.workerUrl), active.external_id);
    await recordUsage(active, await chat.getSnapshot(AbortSignal.timeout(10000)));
  }
  return namedLocks.doWithLock(
    `course-agent:course:${conversation.course_id}`,
    { timeout: 5000 },
    () =>
      namedLocks.doWithLock(`course-agent:user:${conversation.user_id}`, { timeout: 5000 }, () =>
        runInTransactionAsync(async () => {
          const duplicate = await selectOptionalOperation(conversation.id, input.id);
          const revision = await reserveOperation(
            conversation,
            input.id,
            { kind: 'message', text: input.text },
            input.expectedRevision,
          );
          if (duplicate) return revision;
          const existing = await executions.selectOptionalExecution(conversation.id, input.id);
          if (!existing) {
            const stats = await executions.selectUsageStats(
              conversation.course_id,
              conversation.user_id,
            );
            const recent = await executions.selectRecentRequests(conversation.user_id);
            const active = await executions.selectActiveExecution(conversation.id);
            if (
              recent.requests > settings.maxRequestsPerHour ||
              stats.cost >= settings.dailyCostLimit ||
              (!active.active &&
                (stats.user_active >= settings.maxConcurrentPerUser ||
                  stats.course_active >= settings.maxConcurrentPerCourse))
            ) {
              throw new TRPCError({
                code: 'TOO_MANY_REQUESTS',
                message: 'Course agent usage limit reached. Try again later.',
              });
            }
            await executions.insertExecution(conversation.id, input.id);
          }
          return revision;
        }),
      ),
  );
}

/** A cold continuation consumes a new execution slot; warm results continue their admitted turn. */
export async function admitResult(
  conversation: CourseAgentConversation,
  id: string,
  snapshot: ChatSnapshot,
) {
  if (Object.values(snapshot.executions ?? {}).some((value) => value.status === 'running')) return;
  const settings = config.courseAgent!;
  await namedLocks.doWithLock(
    `course-agent:course:${conversation.course_id}`,
    { timeout: 5000 },
    () =>
      namedLocks.doWithLock(`course-agent:user:${conversation.user_id}`, { timeout: 5000 }, () =>
        runInTransactionAsync(async () => {
          if (await executions.selectOptionalExecution(conversation.id, id)) return;
          const stats = await executions.selectUsageStats(
            conversation.course_id,
            conversation.user_id,
          );
          if (
            stats.cost >= settings.dailyCostLimit ||
            stats.user_active >= settings.maxConcurrentPerUser ||
            stats.course_active >= settings.maxConcurrentPerCourse
          ) {
            throw new TRPCError({
              code: 'TOO_MANY_REQUESTS',
              message: 'Result is saved. Retry completion when course agent capacity is available.',
            });
          }
          await executions.insertExecution(conversation.id, id);
        }),
      ),
  );
}
