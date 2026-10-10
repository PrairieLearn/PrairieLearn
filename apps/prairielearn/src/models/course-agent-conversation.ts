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

import { CourseAgentConversationSchema } from '../lib/db-types.js';

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

export const nameConversation = (id: string, title: string) =>
  execute(sql.update_conversation_title, { id, title });
export const selectOptionalConversationByExternalId = (scope: AgentScope, external_id: string) =>
  queryOptionalRow(
    sql.select_conversation_by_external_id,
    { course_id: scope.course_id, user_id: scope.user_id, external_id },
    CourseAgentConversationSchema,
  );
export const recordConversationFinished = (id: string, finished_at: Date) =>
  execute(sql.update_conversation_finished, { id, finished_at });

export const selectOptionalConversationContext = (external_id: string) =>
  queryOptionalRow(
    sql.select_conversation_context,
    { external_id },
    z.object({ course_id: z.string(), user_id: z.string(), deleted_at: z.date().nullable() }),
  );
