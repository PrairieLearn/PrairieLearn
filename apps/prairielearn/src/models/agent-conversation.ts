import { isDeepStrictEqual } from 'node:util';

import { z } from 'zod';

import type { AgentEventInput, AgentRepository } from '@prairielearn/agent-protocol';
import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
  queryScalar,
  queryScalars,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  type AgentArtifact,
  AgentArtifactSchema,
  type AgentConversation,
  AgentConversationSchema,
  type AgentDraftQuestion,
  AgentDraftQuestionSchema,
  type AgentEvent,
  AgentEventSchema,
  type AgentOperation,
  AgentOperationSchema,
  type AgentRun,
  AgentRunSchema,
  type EnumAgentRunStatus,
} from '../lib/db-types.js';

import { insertAuditEvent } from './audit-event.js';

const sql = loadSqlEquiv(import.meta.url);

function redactRun(run: AgentRun) {
  return {
    ...run,
    capability_jti: '[redacted]',
    claude_session_id: run.claude_session_id === null ? null : '[redacted]',
    error: run.error === null ? null : '[redacted]',
    message: '[redacted]',
  };
}

function redactOperation(operation: AgentOperation) {
  return {
    ...operation,
    request: {},
    response: operation.response === null ? null : {},
  };
}

function redactArtifact(artifact: AgentArtifact) {
  return {
    ...artifact,
    metadata: {},
    storage_key: '[redacted]',
  };
}

export function isAgentRunStatusTransitionAllowed(
  from: EnumAgentRunStatus,
  to: EnumAgentRunStatus,
): boolean {
  if (from === to) return true;
  return (
    (from === 'pending' && ['running', 'failed', 'canceled'].includes(to)) ||
    (from === 'running' && ['completed', 'failed', 'canceled'].includes(to)) ||
    (from === 'stopping' && ['completed', 'failed', 'canceled'].includes(to))
  );
}

export async function createAgentConversation({
  courseId,
  authnUserId,
  userId,
  title,
  repository,
}: {
  courseId: string;
  authnUserId: string;
  userId: string;
  title: string | null;
  repository: AgentRepository | undefined;
}): Promise<AgentConversation> {
  return await runInTransactionAsync(async () => {
    const conversation = await queryRow(
      sql.insert_conversation,
      {
        authn_user_id: authnUserId,
        course_id: courseId,
        repository_base_sha: repository?.base_sha ?? null,
        repository_branch: repository?.branch ?? null,
        repository_url: repository?.https_url ?? null,
        title,
        user_id: userId,
      },
      AgentConversationSchema,
    );
    await insertAuditEvent({
      tableName: 'agent_conversations',
      action: 'insert',
      agentAuthnUserId: authnUserId,
      agentUserId: userId,
      courseId,
      newRow: conversation,
      rowId: conversation.id,
    });
    return conversation;
  });
}

export async function selectAgentConversation({
  conversationId,
  courseId,
  authnUserId,
}: {
  conversationId: string;
  courseId: string;
  authnUserId: string;
}): Promise<AgentConversation | null> {
  return await queryOptionalRow(
    sql.select_conversation,
    {
      authn_user_id: authnUserId,
      conversation_id: conversationId,
      course_id: courseId,
    },
    AgentConversationSchema,
  );
}

export async function selectAgentConversations({
  courseId,
  authnUserId,
}: {
  courseId: string;
  authnUserId: string;
}): Promise<AgentConversation[]> {
  return await queryRows(
    sql.select_conversations,
    { authn_user_id: authnUserId, course_id: courseId },
    AgentConversationSchema,
  );
}

export async function selectAgentRuns({
  conversationId,
  courseId,
}: {
  conversationId: string;
  courseId: string;
}): Promise<AgentRun[]> {
  return await queryRows(
    sql.select_runs,
    { conversation_id: conversationId, course_id: courseId },
    AgentRunSchema,
  );
}

export async function selectAgentRun({
  runId,
  courseId,
}: {
  runId: string;
  courseId: string;
}): Promise<AgentRun | null> {
  return await queryOptionalRow(
    sql.select_run,
    { course_id: courseId, run_id: runId },
    AgentRunSchema,
  );
}

export async function selectLatestAgentRun({
  conversationId,
  courseId,
}: {
  conversationId: string;
  courseId: string;
}): Promise<AgentRun | null> {
  return await queryOptionalRow(
    sql.select_latest_run,
    { conversation_id: conversationId, course_id: courseId },
    AgentRunSchema,
  );
}

export async function selectAgentArtifacts(conversationId: string): Promise<AgentArtifact[]> {
  return await queryRows(
    sql.select_artifacts,
    { conversation_id: conversationId },
    AgentArtifactSchema,
  );
}

async function selectAgentDraftQuestion({
  conversationId,
  requestedQid,
}: {
  conversationId: string;
  requestedQid: string;
}): Promise<AgentDraftQuestion | null> {
  return await queryOptionalRow(
    sql.select_agent_draft_question,
    { conversation_id: conversationId, requested_qid: requestedQid },
    AgentDraftQuestionSchema,
  );
}

export async function reserveAgentDraftQuestion({
  conversationId,
  requestedQid,
}: {
  conversationId: string;
  requestedQid: string;
}): Promise<{ reservation: AgentDraftQuestion; created: boolean }> {
  const inserted = await queryOptionalRow(
    sql.reserve_agent_draft_question,
    { conversation_id: conversationId, requested_qid: requestedQid },
    AgentDraftQuestionSchema,
  );
  if (inserted !== null) return { created: true, reservation: inserted };
  const existing = await selectAgentDraftQuestion({ conversationId, requestedQid });
  if (existing === null) throw new Error('Agent draft question reservation disappeared.');
  return { created: false, reservation: existing };
}

export async function completeAgentDraftQuestion({
  reservationId,
  questionId,
  userId,
}: {
  reservationId: string;
  questionId: string;
  userId: string;
}): Promise<AgentDraftQuestion> {
  return await queryRow(
    sql.complete_agent_draft_question,
    { id: reservationId, question_id: questionId, user_id: userId },
    AgentDraftQuestionSchema,
  );
}

export async function releaseAgentDraftQuestion(reservationId: string): Promise<void> {
  await execute(sql.release_agent_draft_question, { id: reservationId });
}

export async function selectAgentDraftQuestionIds(conversationId: string): Promise<string[]> {
  return await queryScalars(
    sql.select_agent_draft_question_ids,
    { conversation_id: conversationId },
    IdSchema,
  );
}

async function appendEventsInCurrentTransaction({
  conversationId,
  runId,
  events,
  allowNew = true,
}: {
  conversationId: string;
  runId: string | null;
  events: AgentEventInput[];
  allowNew?: boolean;
}): Promise<AgentEvent[]> {
  await queryScalar(sql.lock_conversation, { conversation_id: conversationId }, IdSchema);
  let sequence = await queryScalar(
    sql.next_event_sequence,
    { conversation_id: conversationId },
    z.coerce.number(),
  );
  const inserted: AgentEvent[] = [];
  for (const event of events) {
    const existing = await queryOptionalRow(
      sql.select_event_by_event_id,
      { event_id: event.event_id },
      AgentEventSchema,
    );
    if (existing !== null) {
      if (
        existing.conversation_id !== conversationId ||
        existing.run_id !== runId ||
        existing.type !== event.type ||
        existing.operation_id !== (event.operation_id ?? null) ||
        !isDeepStrictEqual(existing.data, event.data)
      ) {
        throw new Error(`Agent event ID ${event.event_id} was reused with different content.`);
      }
      inserted.push(existing);
      continue;
    }
    if (!allowNew) {
      throw new Error('Cannot append a new event to a terminal agent run.');
    }
    inserted.push(
      await queryRow(
        sql.insert_event,
        {
          conversation_id: conversationId,
          data: event.data,
          event_id: event.event_id,
          operation_id: event.operation_id ?? null,
          run_id: runId,
          sequence,
          type: event.type,
        },
        AgentEventSchema,
      ),
    );
    sequence++;
  }
  await execute(sql.touch_conversation, { conversation_id: conversationId });
  return inserted;
}

export async function appendAgentRunEvents({
  run,
  courseId,
  events,
  terminalStatus,
  error,
  claudeSessionId,
}: {
  run: AgentRun;
  courseId: string;
  events: AgentEventInput[];
  terminalStatus: EnumAgentRunStatus | null;
  error: string | null;
  claudeSessionId: string | null;
}): Promise<AgentEvent[]> {
  return await runInTransactionAsync(async () => {
    await queryScalar(sql.lock_conversation, { conversation_id: run.conversation_id }, IdSchema);
    const currentRun = await queryRow(
      sql.select_run_for_update,
      { conversation_id: run.conversation_id, run_id: run.id },
      AgentRunSchema,
    );
    const inserted = await appendEventsInCurrentTransaction({
      allowNew: !['completed', 'failed', 'canceled'].includes(currentRun.status),
      conversationId: currentRun.conversation_id,
      events,
      runId: currentRun.id,
    });
    if (terminalStatus !== null && terminalStatus !== currentRun.status) {
      if (!isAgentRunStatusTransitionAllowed(currentRun.status, terminalStatus)) {
        throw new Error(
          `Invalid agent run status transition: ${currentRun.status} -> ${terminalStatus}`,
        );
      }
      const updated = await queryRow(
        sql.update_run_status,
        {
          claude_session_id: claudeSessionId,
          error,
          run_id: currentRun.id,
          status: terminalStatus,
        },
        AgentRunSchema,
      );
      await insertAuditEvent({
        tableName: 'agent_runs',
        action: 'update',
        actionDetail: 'status',
        agentAuthnUserId: currentRun.authn_user_id,
        agentUserId: currentRun.user_id,
        courseId,
        newRow: redactRun(updated),
        oldRow: redactRun(currentRun),
        rowId: currentRun.id,
      });
    }
    return inserted;
  });
}

export async function listAgentEvents({
  conversationId,
  afterSequence,
  limit = 201,
}: {
  conversationId: string;
  afterSequence: number;
  limit?: number;
}): Promise<AgentEvent[]> {
  return await queryRows(
    sql.list_events,
    { after_sequence: afterSequence, conversation_id: conversationId, limit },
    AgentEventSchema,
  );
}

export async function createAgentRun({
  conversation,
  authnUserId,
  userId,
  message,
  capabilityJti,
  capabilityExpiresAt,
  allowedTools,
  baseCommitSha,
}: {
  conversation: AgentConversation;
  authnUserId: string;
  userId: string;
  message: string;
  capabilityJti: string;
  capabilityExpiresAt: Date;
  allowedTools: string[];
  baseCommitSha: string | null;
}): Promise<AgentRun> {
  return await runInTransactionAsync(async () => {
    const run = await queryRow(
      sql.insert_run,
      {
        allowed_tools: allowedTools,
        authn_user_id: authnUserId,
        base_commit_sha: baseCommitSha,
        capability_expires_at: capabilityExpiresAt,
        capability_jti: capabilityJti,
        conversation_id: conversation.id,
        message,
        user_id: userId,
      },
      AgentRunSchema,
    );
    await appendEventsInCurrentTransaction({
      conversationId: conversation.id,
      events: [{ data: { message }, event_id: `user-message:${run.id}`, type: 'user_message' }],
      runId: run.id,
    });
    await insertAuditEvent({
      tableName: 'agent_runs',
      action: 'insert',
      agentAuthnUserId: authnUserId,
      agentUserId: userId,
      courseId: conversation.course_id,
      newRow: redactRun(run),
      rowId: run.id,
    });
    return run;
  });
}

export async function selectActiveAgentRun(conversationId: string): Promise<AgentRun | null> {
  return await queryOptionalRow(
    sql.select_active_run,
    { conversation_id: conversationId },
    AgentRunSchema,
  );
}

export async function requestAgentRunStop({
  run,
  courseId,
}: {
  run: AgentRun;
  courseId: string;
}): Promise<AgentRun> {
  return await runInTransactionAsync(async () => {
    const updated = await queryOptionalRow(sql.request_stop, { run_id: run.id }, AgentRunSchema);
    if (!updated) return run;
    await insertAuditEvent({
      tableName: 'agent_runs',
      action: 'update',
      actionDetail: 'status',
      agentAuthnUserId: run.authn_user_id,
      agentUserId: run.user_id,
      courseId,
      newRow: redactRun(updated),
      oldRow: redactRun(run),
      rowId: run.id,
    });
    return updated;
  });
}

export async function tombstoneAgentConversation({
  conversation,
}: {
  conversation: AgentConversation;
}): Promise<void> {
  await runInTransactionAsync(async () => {
    const deleted = await queryRow(
      sql.tombstone_conversation,
      { conversation_id: conversation.id },
      AgentConversationSchema,
    );
    const oldArtifacts = await queryRows(
      sql.select_artifacts_for_update,
      { conversation_id: conversation.id },
      AgentArtifactSchema,
    );
    const deletedArtifacts = await queryRows(
      sql.tombstone_artifacts,
      { conversation_id: conversation.id },
      AgentArtifactSchema,
    );
    const oldRuns = await queryRows(
      sql.select_runs_for_update,
      { conversation_id: conversation.id },
      AgentRunSchema,
    );
    const deletedRuns = await queryRows(
      sql.redact_conversation_runs,
      { conversation_id: conversation.id },
      AgentRunSchema,
    );
    const oldOperations = await queryRows(
      sql.select_operations_for_update,
      { conversation_id: conversation.id },
      AgentOperationSchema,
    );
    const deletedOperations = await queryRows(
      sql.redact_conversation_operations,
      { conversation_id: conversation.id },
      AgentOperationSchema,
    );
    await execute(sql.redact_conversation_events, { conversation_id: conversation.id });
    await execute(sql.delete_conversation_draft_questions, {
      conversation_id: conversation.id,
    });
    const oldRunsById = new Map(oldRuns.map((run) => [run.id, run]));
    const oldOperationsById = new Map(oldOperations.map((operation) => [operation.id, operation]));
    const oldArtifactsById = new Map(oldArtifacts.map((artifact) => [artifact.id, artifact]));
    for (const run of deletedRuns) {
      await insertAuditEvent({
        tableName: 'agent_runs',
        action: 'update',
        actionDetail: 'deleted',
        agentAuthnUserId: conversation.authn_user_id,
        agentUserId: conversation.user_id,
        courseId: conversation.course_id,
        newRow: redactRun(run),
        oldRow: redactRun(oldRunsById.get(run.id)!),
        rowId: run.id,
      });
    }
    for (const operation of deletedOperations) {
      await insertAuditEvent({
        tableName: 'agent_operations',
        action: 'update',
        actionDetail: 'deleted',
        agentAuthnUserId: conversation.authn_user_id,
        agentUserId: conversation.user_id,
        courseId: conversation.course_id,
        newRow: redactOperation(operation),
        oldRow: redactOperation(oldOperationsById.get(operation.id)!),
        rowId: operation.id,
      });
    }
    for (const artifact of deletedArtifacts) {
      await insertAuditEvent({
        tableName: 'agent_artifacts',
        action: 'update',
        actionDetail: 'deleted',
        agentAuthnUserId: conversation.authn_user_id,
        agentUserId: conversation.user_id,
        courseId: conversation.course_id,
        newRow: redactArtifact(artifact),
        oldRow: redactArtifact(oldArtifactsById.get(artifact.id)!),
        rowId: artifact.id,
      });
    }
    await insertAuditEvent({
      tableName: 'agent_conversations',
      action: 'update',
      actionDetail: 'deleted',
      agentAuthnUserId: conversation.authn_user_id,
      agentUserId: conversation.user_id,
      courseId: conversation.course_id,
      newRow: deleted,
      oldRow: conversation,
      rowId: conversation.id,
    });
  });
}

export async function beginAgentOperation({
  operationId,
  run,
  toolName,
  request,
  expectedRevision,
  courseId,
}: {
  operationId: string;
  run: AgentRun;
  toolName: string;
  request: Record<string, unknown>;
  expectedRevision: string | null;
  courseId: string;
}): Promise<{ operation: AgentOperation; created: boolean }> {
  return await runInTransactionAsync(async () => {
    const inserted = await queryOptionalRow(
      sql.insert_operation,
      {
        expected_revision: expectedRevision,
        operation_id: operationId,
        request,
        run_id: run.id,
        tool_name: toolName,
      },
      AgentOperationSchema,
    );
    if (!inserted) {
      const operation = await queryRow(
        sql.select_operation,
        { operation_id: operationId },
        AgentOperationSchema,
      );
      return { created: false, operation };
    }
    await appendEventsInCurrentTransaction({
      conversationId: run.conversation_id,
      events: [
        {
          data: { input: request, tool_name: toolName },
          event_id: `tool-call:${operationId}`,
          operation_id: operationId,
          type: 'tool_call',
        },
      ],
      runId: run.id,
    });
    await insertAuditEvent({
      tableName: 'agent_operations',
      action: 'insert',
      agentAuthnUserId: run.authn_user_id,
      agentUserId: run.user_id,
      courseId,
      newRow: redactOperation(inserted),
      rowId: inserted.id,
    });
    return { created: true, operation: inserted };
  });
}

export async function selectAgentOperationResultEvent(
  operationId: string,
): Promise<AgentEvent | null> {
  return await queryOptionalRow(
    sql.select_event_for_operation,
    { operation_id: operationId, type: 'tool_result' },
    AgentEventSchema,
  );
}

export async function selectAgentOperation(operationId: string): Promise<AgentOperation | null> {
  return await queryOptionalRow(
    sql.select_operation,
    { operation_id: operationId },
    AgentOperationSchema,
  );
}

export async function selectLatestAgentCheckpoint(runId: string): Promise<AgentEvent | null> {
  return await queryOptionalRow(sql.select_latest_checkpoint, { run_id: runId }, AgentEventSchema);
}

export async function selectLatestAgentConversationCheckpoint(
  conversationId: string,
): Promise<AgentEvent | null> {
  return await queryOptionalRow(
    sql.select_latest_conversation_checkpoint,
    { conversation_id: conversationId },
    AgentEventSchema,
  );
}

export async function selectAgentUserIsAdministrator(userId: string): Promise<boolean> {
  return await queryScalar(sql.select_is_administrator, { user_id: userId }, z.boolean());
}

export async function completeAgentOperation({
  operation,
  run,
  result,
  commitSha,
  courseId,
}: {
  operation: AgentOperation;
  run: AgentRun;
  result: Record<string, unknown>;
  commitSha: string | null;
  courseId: string;
}): Promise<{ operation: AgentOperation; event: AgentEvent }> {
  return await runInTransactionAsync(async () => {
    const updated = await queryRow(
      sql.complete_operation,
      { commit_sha: commitSha, operation_id: operation.operation_id, response: result },
      AgentOperationSchema,
    );
    const [event] = await appendEventsInCurrentTransaction({
      conversationId: run.conversation_id,
      events: [
        {
          data: { result, tool_name: operation.tool_name },
          event_id: `tool-result:${operation.operation_id}`,
          operation_id: operation.operation_id,
          type: 'tool_result',
        },
      ],
      runId: run.id,
    });
    await insertAuditEvent({
      tableName: 'agent_operations',
      action: 'update',
      actionDetail: 'completed',
      agentAuthnUserId: run.authn_user_id,
      agentUserId: run.user_id,
      courseId,
      newRow: redactOperation(updated),
      oldRow: redactOperation(operation),
      rowId: operation.id,
    });
    return { event, operation: updated };
  });
}

export async function failAgentOperation({
  operation,
  run,
  error,
  courseId,
}: {
  operation: AgentOperation;
  run: AgentRun;
  error: string;
  courseId: string;
}): Promise<void> {
  await runInTransactionAsync(async () => {
    const updated = await queryRow(
      sql.fail_operation,
      { error, operation_id: operation.operation_id },
      AgentOperationSchema,
    );
    await insertAuditEvent({
      tableName: 'agent_operations',
      action: 'update',
      actionDetail: 'failed',
      agentAuthnUserId: run.authn_user_id,
      agentUserId: run.user_id,
      courseId,
      newRow: redactOperation(updated),
      oldRow: redactOperation(operation),
      rowId: operation.id,
    });
  });
}

export async function retryAgentOperation({
  operation,
  run,
  courseId,
}: {
  operation: AgentOperation;
  run: AgentRun;
  courseId: string;
}): Promise<AgentOperation> {
  return await runInTransactionAsync(async () => {
    const updated = await queryRow(sql.retry_operation, { id: operation.id }, AgentOperationSchema);
    await insertAuditEvent({
      tableName: 'agent_operations',
      action: 'update',
      actionDetail: 'retried',
      agentAuthnUserId: run.authn_user_id,
      agentUserId: run.user_id,
      courseId,
      newRow: redactOperation(updated),
      oldRow: redactOperation(operation),
      rowId: operation.id,
    });
    return updated;
  });
}

export async function reclaimAgentOperation({
  operation,
  run,
  courseId,
}: {
  operation: AgentOperation;
  run: AgentRun;
  courseId: string;
}): Promise<AgentOperation | null> {
  return await runInTransactionAsync(async () => {
    const updated = await queryOptionalRow(
      sql.reclaim_operation,
      { id: operation.id },
      AgentOperationSchema,
    );
    if (updated === null) return null;
    await insertAuditEvent({
      tableName: 'agent_operations',
      action: 'update',
      actionDetail: 'retried',
      agentAuthnUserId: run.authn_user_id,
      agentUserId: run.user_id,
      courseId,
      newRow: redactOperation(updated),
      oldRow: redactOperation(operation),
      rowId: operation.id,
    });
    return updated;
  });
}
