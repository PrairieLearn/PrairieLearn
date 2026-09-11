import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { CourseAgentRunUsageSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export function createCourseAgentRunUsage(runId: string) {
  return execute(sql.create_usage, { run_id: runId });
}

export function finalizeCourseAgentRunUsage(runId: string) {
  return execute(sql.finalize_usage, { run_id: runId });
}

export function selectCourseAgentRunUsages(conversationId: string) {
  return queryRows(
    sql.select_usages,
    { conversation_id: conversationId },
    CourseAgentRunUsageSchema,
  );
}

export function selectOptionalCourseAgentUsageIdentity(identity: {
  runId: string;
  conversationId: string;
  userId: string;
  courseId: string;
}) {
  return queryOptionalRow(
    sql.select_identity,
    {
      run_id: identity.runId,
      conversation_id: identity.conversationId,
      user_id: identity.userId,
      course_id: identity.courseId,
    },
    z.object({
      user_id: IdSchema,
      course_id: IdSchema,
      status: z.enum(['running', 'completed', 'failed']),
    }),
  );
}

export function authorizeCourseAgentUsageReceipt(id: string, runId: string, model: string) {
  return execute(sql.authorize_receipt, { id, run_id: runId, model });
}

export async function recordCourseAgentUsageReceipt({
  id,
  runId,
  model,
  usage,
  cost,
}: {
  id: string;
  runId: string;
  model: string;
  usage: {
    input_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
  };
  cost: number;
}) {
  return runInTransactionAsync(async () => {
    const inserted = await queryOptionalRow(
      sql.complete_receipt,
      {
        id,
        run_id: runId,
        model,
        usage: JSON.stringify(usage),
        cost,
      },
      z.object({ id: z.uuid() }),
    );
    if (!inserted) return false;
    await createCourseAgentRunUsage(runId);
    await execute(sql.add_usage, { run_id: runId, ...usage, cost });
    return true;
  });
}
