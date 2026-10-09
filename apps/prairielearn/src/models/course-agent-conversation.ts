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
  type CourseAgentOperation,
  CourseAgentOperationSchema,
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
/**
 * Serialize writers on the conversation row. Retries may reuse a saved operation
 * only with identical input; a different operation must post the counter the
 * instructor actually observed. No network calls run inside this transaction.
 */
export async function reserveOperation(
  conversation: CourseAgentConversation,
  operation_id: string,
  payload: CourseAgentOperation['payload'],
  expected: number,
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
      return existing.operation_number;
    }
    if (row.operation_number !== expected) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Conversation changed. Refresh before retrying; your draft is preserved.',
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

export const nameConversation = (id: string, title: string) =>
  execute(sql.update_conversation_title, { id, title });
export const selectConversationOperations = (id: string) =>
  queryRows(sql.select_message_operations, { id }, CourseAgentOperationSchema);
