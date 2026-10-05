import { randomUUID } from 'node:crypto';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  type CourseAgentConversation,
  CourseAgentConversationSchema,
  CourseAgentOperationSchema,
  type CourseAgentUsage,
} from '../lib/db-types.js';

import { insertAuditEvent } from './audit-event.js';

const sql = loadSqlEquiv(import.meta.url);
export interface AgentScope {
  course_id: string;
  user_id: string;
  authn_user_id: string;
}
export const selectConversations = (scope: AgentScope) =>
  queryRows(
    sql.select_conversations,
    { course_id: scope.course_id, user_id: scope.user_id },
    CourseAgentConversationSchema,
  );
export async function selectConversation(scope: AgentScope, id: string) {
  const row = await queryOptionalRow(
    sql.select_conversation,
    { course_id: scope.course_id, user_id: scope.user_id, id },
    CourseAgentConversationSchema,
  );
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found.' });
  return row;
}
export async function createConversation(
  scope: AgentScope,
  input: { title: string; repository: string; branch: string },
) {
  return runInTransactionAsync(async () => {
    const row = await queryRow(
      sql.insert_conversation,
      { course_id: scope.course_id, user_id: scope.user_id, ...input, external_id: randomUUID() },
      CourseAgentConversationSchema,
    );
    await insertAuditEvent({
      tableName: 'course_agent_conversations',
      action: 'insert',
      rowId: row.id,
      agentUserId: scope.user_id,
      agentAuthnUserId: scope.authn_user_id,
      courseId: scope.course_id,
      newRow: row,
    });
    return row;
  });
}
export async function reserveOperation(
  conversation: CourseAgentConversation,
  operation_id: string,
  payload: Record<string, unknown>,
  expected: number,
  gate = true,
) {
  return runInTransactionAsync(async () => {
    const row = await queryRow(
      sql.select_conversation_for_update,
      { id: conversation.id },
      CourseAgentConversationSchema,
    );
    const existing = await queryOptionalRow(
      sql.select_operation,
      { id: row.id, operation_id },
      CourseAgentOperationSchema,
    );
    if (existing) {
      const { same } = await queryRow(
        sql.select_operation_payload_matches,
        { id: row.id, operation_id, payload: JSON.stringify(payload) },
        z.object({ same: z.boolean() }),
      );
      if (!same) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Operation ID reused with different input.',
        });
      }
      // A fenced rejection can be retried with a fresh dispatch identity. An
      // uncertain send keeps its identity until the Worker acknowledges it.
      if (existing.status === 'rejected') {
        await execute(sql.retry_operation, { id: row.id, operation_id });
      }
      return existing.operation_number;
    }
    if (row.operation_number !== expected) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Conversation changed. Refresh before retrying; your draft is preserved.',
      });
    }
    if (
      gate &&
      (
        await queryRow(
          sql.select_pending_proposal_exists,
          { id: row.id },
          z.object({ pending: z.boolean() }),
        )
      ).pending
    ) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Resolve the pending proposal before sending another message.',
      });
    }
    const { operation_number } = await queryRow(
      sql.increment_operation_number,
      { id: row.id },
      z.object({ operation_number: z.number() }),
    );
    await execute(sql.insert_operation, {
      id: row.id,
      operation_id,
      payload: JSON.stringify(payload),
      operation_number,
    });
    return operation_number;
  });
}

export const selectConversationActivity = (scope: AgentScope) =>
  queryRows(
    sql.select_conversation_activity,
    { course_id: scope.course_id, user_id: scope.user_id },
    z.object({
      conversation: CourseAgentConversationSchema,
      running: z.boolean(),
      finished_at: z.coerce.date().nullable(),
    }),
  );
export const nameConversation = (id: string, title: string) =>
  execute(sql.update_conversation_title, { id, title });
export const selectConversationOperations = (id: string) =>
  queryRows(sql.select_message_operations, { id }, CourseAgentOperationSchema);

export const selectOptionalOperation = (id: string, operation_id: string) =>
  queryOptionalRow(sql.select_operation, { id, operation_id }, CourseAgentOperationSchema);
export const selectActiveOperations = (id: string) =>
  queryRows(sql.select_active_operations, { id }, CourseAgentOperationSchema);
export const rejectOperation = (id: string, operation_id: string, dispatch_id: string) =>
  execute(sql.reject_operation, { id, operation_id, dispatch_id });
export const saveOperationStatuses = (
  id: string,
  updates: { operation_id: string; dispatch_id: string; status: string }[],
) => execute(sql.update_operation_statuses, { id, updates: JSON.stringify(updates) });

/** Reserve a cold tool-result continuation independently of usage accounting. */
export async function reserveContinuation(
  conversation: CourseAgentConversation,
  operation_id: string,
) {
  return runInTransactionAsync(async () => {
    const row = await queryRow(
      sql.select_conversation_for_update,
      { id: conversation.id },
      CourseAgentConversationSchema,
    );
    const existing = await selectOptionalOperation(row.id, operation_id);
    if (!existing) {
      await execute(sql.insert_operation, {
        id: row.id,
        operation_id,
        payload: JSON.stringify({ kind: 'result' }),
        operation_number: row.operation_number,
      });
    } else if (['rejected', 'failed', 'cancelled', 'interrupted'].includes(existing.status)) {
      await execute(sql.retry_operation, { id: row.id, operation_id });
    }
    return (await selectOptionalOperation(row.id, operation_id))!.dispatch_id;
  });
}

/** Latest cumulative snapshot, not an increment: repeated/out-of-order deliveries are safe. */
export const saveConversationUsage = async (id: string, usage: CourseAgentUsage) => {
  await execute(sql.update_conversation_usage, {
    id,
    usage: JSON.stringify(usage),
    version: usage.version,
  });
  return queryRow(sql.select_conversation_by_id, { id }, CourseAgentConversationSchema);
};
export const selectUserAccountingConversations = (user_id: string) =>
  queryRows(sql.select_user_accounting_conversations, { user_id }, CourseAgentConversationSchema);
export const selectUserCapacity = (user_id: string, id: string) =>
  queryRow(
    sql.select_user_capacity,
    { user_id, id },
    z.object({ active: z.number(), current_active: z.boolean(), unknown: z.boolean() }),
  );

export const selectConversationForUpdate = (id: string) =>
  queryRow(sql.select_conversation_for_update, { id }, CourseAgentConversationSchema);
