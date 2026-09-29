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
  type CourseAgentProposal,
  CourseAgentProposalSchema,
} from '../lib/db-types.js';

import { insertAuditEvent } from './audit-event.js';
import { type AgentScope, reserveOperation } from './course-agent-conversation.js';

const sql = loadSqlEquiv(import.meta.url);
export const selectOptionalProposal = (conversation_id: string, operation_id: string) =>
  queryOptionalRow(sql.select, { conversation_id, operation_id }, CourseAgentProposalSchema);
export const selectProposals = (conversation_id: string) =>
  queryRows(sql.list, { conversation_id }, CourseAgentProposalSchema);
export const insertProposal = (input: {
  conversation_id: string;
  operation_id: string;
  sequence: number;
  payload: string;
  digest: string;
}) => queryOptionalRow(sql.insert, input, CourseAgentProposalSchema);
export const prepareProposal = (
  id: string,
  payload: unknown,
  prepared: boolean,
  error: string | null,
) => execute(sql.prepare, { id, payload: JSON.stringify(payload), prepared, error });
export const saveProposalProgress = (
  id: string,
  input: Partial<
    Pick<
      CourseAgentProposal,
      'published_sha' | 'sync_job_sequence_id' | 'synced_sha' | 'outcome' | 'delivered' | 'error'
    >
  >,
) =>
  execute(sql.progress, {
    id,
    published_sha: null,
    sync_job_sequence_id: null,
    synced_sha: null,
    outcome: null,
    delivered: null,
    error: null,
    ...input,
  });
export const selectSyncStatus = (id: string) =>
  queryRow(sql.job_status, { id }, z.object({ status: z.string() }));
export async function decideProposal(
  scope: AgentScope,
  conversation: CourseAgentConversation,
  row: CourseAgentProposal,
  decision: boolean,
  expectedRevision: number,
) {
  return runInTransactionAsync(async () => {
    await reserveOperation(
      conversation,
      row.operation_id,
      { kind: 'decision', digest: row.digest, approved: decision },
      expectedRevision,
      false,
    );
    if (row.decision !== null) {
      if (row.decision !== decision) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Another decision is already saved.' });
      }
      return;
    }
    const next = await queryOptionalRow(
      sql.decide,
      { id: row.id, decision },
      CourseAgentProposalSchema,
    );
    if (!next) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Another decision is already saved.' });
    }
    await insertAuditEvent({
      tableName: 'course_agent_proposals',
      action: 'update',
      actionDetail: decision ? 'approve' : 'deny',
      rowId: row.id,
      courseId: scope.course_id,
      agentUserId: scope.user_id,
      agentAuthnUserId: scope.authn_user_id,
      oldRow: { decision: null, digest: row.digest },
      newRow: { decision, digest: row.digest },
    });
  });
}
