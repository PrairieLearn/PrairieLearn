import { TRPCError } from '@trpc/server';

import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  type CourseAgentConversation,
  type CourseAgentProposal,
  CourseAgentProposalSchema,
} from '../lib/db-types.js';

import { insertAuditEvent } from './audit-event.js';
import { type AgentScope } from './course-agent-conversation.js';

const sql = loadSqlEquiv(import.meta.url);
export const selectOptionalProposal = (conversation_id: string, operation_id: string) =>
  queryOptionalRow(
    sql.select_proposal,
    { conversation_id, operation_id },
    CourseAgentProposalSchema,
  );
export const selectProposals = (conversation_id: string) =>
  queryRows(sql.select_proposals, { conversation_id }, CourseAgentProposalSchema);
export const insertProposal = (input: {
  conversation_id: string;
  operation_id: string;
  payload: string;
  digest: string;
}) => queryOptionalRow(sql.insert_proposal, input, CourseAgentProposalSchema);
export const prepareProposal = (
  id: string,
  payload: unknown,
  prepared: boolean,
  error: string | null,
) =>
  execute(sql.update_proposal_preparation, {
    id,
    payload: JSON.stringify(payload),
    prepared,
    error,
  });
export const failProposalPreparation = (id: string, error: string) =>
  execute(sql.update_proposal_preparation_failure, {
    id,
    error,
    outcome: `Code change request failed: ${error}`,
  });
export async function saveProposalProgress(
  id: string,
  input: Partial<
    Pick<
      CourseAgentProposal,
      | 'published_sha'
      | 'sync_job_sequence_id'
      | 'synced_sha'
      | 'outcome'
      | 'error'
      | 'outcome_success'
      | 'sync_validation_failed'
      | 'sync_diagnostics'
    >
  >,
) {
  const row = await queryOptionalRow(
    sql.update_proposal_progress,
    {
      id,
      published_sha: null,
      sync_job_sequence_id: null,
      synced_sha: null,
      outcome: null,
      has_error: Object.hasOwn(input, 'error'),
      error: null,
      outcome_success: null,
      sync_validation_failed: null,
      sync_diagnostics: null,
      ...input,
    },
    CourseAgentProposalSchema,
  );
  if (!row) {
    throw new TRPCError({
      code: 'CONFLICT',
      message:
        'The publication is complete or its saved commit changed. Refresh its status before retrying.',
    });
  }
  return row;
}
export const resetSyncReceipt = (id: string) => execute(sql.reset_proposal_sync_receipt, { id });
export async function decideProposal(
  scope: AgentScope,
  conversation: CourseAgentConversation,
  row: CourseAgentProposal,
  decision: 'approve' | 'deny',
) {
  const approved = decision === 'approve';
  return runInTransactionAsync(async () => {
    const current = await queryOptionalRow(
      sql.select_proposal_for_update,
      { conversation_id: conversation.id, operation_id: row.operation_id },
      CourseAgentProposalSchema,
    );
    if (current?.digest !== row.digest) {
      throw new TRPCError({ code: 'CONFLICT', message: 'The reviewed proposal changed.' });
    }
    row = current;
    if (row.decision !== null) {
      if (row.decision !== approved) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Another decision is already saved.' });
      }
      return;
    }
    const next = await queryOptionalRow(
      sql.update_proposal_decision,
      { id: row.id, decision: approved, digest: row.digest },
      CourseAgentProposalSchema,
    );
    if (!next) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Another decision is already saved.' });
    }
    await insertAuditEvent({
      tableName: 'course_agent_proposals',
      action: 'update',
      actionDetail: decision,
      rowId: row.id,
      courseId: scope.course_id,
      agentUserId: scope.user_id,
      agentAuthnUserId: scope.authn_user_id,
      oldRow: { decision: null, digest: row.digest },
      newRow: { decision: approved, digest: row.digest },
    });
  });
}
