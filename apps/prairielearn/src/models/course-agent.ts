import { createHash, randomUUID } from 'node:crypto';

import {
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  CourseAgentConversationSchema,
  CourseAgentEventSchema,
  CourseAgentMessageSchema,
  CourseAgentRunSchema,
  CourseAgentWorkspaceBackupSchema,
  type EnumCourseAgentBackupReason,
  type EnumCourseAgentMessageStatus,
  type EnumCourseAgentRunStatus,
  type EnumCourseAgentRuntimeStatus,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function createCourseAgentConversation({
  courseId,
  userId,
  title = 'New chat',
  coursePath,
}: {
  courseId: string;
  userId: string;
  title?: string;
  coursePath: string;
}) {
  return await queryRow(
    sql.insert_conversation,
    { course_id: courseId, user_id: userId, title, course_path: coursePath },
    CourseAgentConversationSchema,
  );
}

export async function selectCourseAgentConversations({
  courseId,
  userId,
}: {
  courseId: string;
  userId: string;
}) {
  return await queryRows(
    sql.select_conversations,
    { course_id: courseId, user_id: userId },
    CourseAgentConversationSchema,
  );
}

export async function selectCourseAgentConversation({
  conversationId,
  courseId,
  userId,
}: {
  conversationId: string;
  courseId: string;
  userId: string;
}) {
  return await queryOptionalRow(
    sql.select_conversation,
    { conversation_id: conversationId, course_id: courseId, user_id: userId },
    CourseAgentConversationSchema,
  );
}

/** Selects by ID for a request that has already been authenticated by a run capability. */
export async function selectCourseAgentConversationById(conversationId: string) {
  return await queryOptionalRow(
    sql.select_conversation_by_id,
    { conversation_id: conversationId },
    CourseAgentConversationSchema,
  );
}

export async function updateCourseAgentConversationTitle({
  conversationId,
  title,
}: {
  conversationId: string;
  title: string;
}) {
  return await queryRow(
    sql.update_conversation_title,
    { conversation_id: conversationId, title },
    CourseAgentConversationSchema,
  );
}

export async function updateCourseAgentConversationRuntime({
  conversationId,
  runtimeStatus,
  containerId,
  coursePath,
  lastActivityAt,
  idleDeadlineAt,
  lastError,
}: {
  conversationId: string;
  runtimeStatus: EnumCourseAgentRuntimeStatus;
  containerId: string | null;
  coursePath: string | null;
  lastActivityAt: Date | null;
  idleDeadlineAt: Date | null;
  lastError: string | null;
}) {
  return await queryRow(
    sql.update_conversation_runtime,
    {
      conversation_id: conversationId,
      runtime_status: runtimeStatus,
      container_id: containerId,
      course_path: coursePath,
      last_activity_at: lastActivityAt,
      idle_deadline_at: idleDeadlineAt,
      last_error: lastError,
    },
    CourseAgentConversationSchema,
  );
}

export async function deleteCourseAgentConversation(conversationId: string) {
  return await queryRow(
    sql.mark_conversation_deleted,
    { conversation_id: conversationId },
    CourseAgentConversationSchema,
  );
}

export async function createCourseAgentRun({
  conversationId,
  authnUserId,
  prompt,
  baseCommitSha,
}: {
  conversationId: string;
  authnUserId: string;
  prompt: string;
  baseCommitSha: string | null;
}) {
  return await runInTransactionAsync(async () => {
    const promptDigest = createHash('sha256').update(prompt).digest('hex');
    const run = await queryRow(
      sql.insert_run,
      {
        conversation_id: conversationId,
        prompt_digest: promptDigest,
        base_commit_sha: baseCommitSha,
      },
      CourseAgentRunSchema,
    );

    const userMessage = await queryRow(
      sql.insert_message,
      {
        conversation_id: conversationId,
        run_id: run.id,
        authn_user_id: authnUserId,
        role: 'user',
        status: 'completed',
        parts: JSON.stringify([{ type: 'text', text: prompt }]),
        metadata: JSON.stringify({}),
      },
      CourseAgentMessageSchema,
    );

    const assistantMessage = await queryRow(
      sql.insert_message,
      {
        conversation_id: conversationId,
        run_id: run.id,
        authn_user_id: null,
        role: 'assistant',
        status: 'pending',
        parts: JSON.stringify([]),
        metadata: JSON.stringify({}),
      },
      CourseAgentMessageSchema,
    );

    await appendCourseAgentEvent({
      conversationId,
      runId: run.id,
      eventType: 'run.created',
      data: { prompt_digest: promptDigest },
    });

    return { run, userMessage, assistantMessage };
  });
}

export async function selectCourseAgentRun({
  conversationId,
  runId,
}: {
  conversationId: string;
  runId: string;
}) {
  return await queryOptionalRow(
    sql.select_run,
    { conversation_id: conversationId, run_id: runId },
    CourseAgentRunSchema,
  );
}

export async function selectActiveCourseAgentRun(conversationId: string) {
  return await queryOptionalRow(
    sql.select_active_run,
    { conversation_id: conversationId },
    CourseAgentRunSchema,
  );
}

export async function selectLatestCourseAgentRun(conversationId: string) {
  return await queryOptionalRow(
    sql.select_latest_run,
    { conversation_id: conversationId },
    CourseAgentRunSchema,
  );
}

export async function updateCourseAgentRun({
  runId,
  status,
  baseCommitSha = null,
  commitSha = null,
  pushedSha = null,
  syncJobSequenceId = null,
  errorCode = null,
  errorMessage = null,
  markStarted = false,
  markCompleted = false,
}: {
  runId: string;
  status: EnumCourseAgentRunStatus;
  baseCommitSha?: string | null;
  commitSha?: string | null;
  pushedSha?: string | null;
  syncJobSequenceId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  markStarted?: boolean;
  markCompleted?: boolean;
}) {
  return await queryRow(
    sql.update_run,
    {
      run_id: runId,
      status,
      base_commit_sha: baseCommitSha,
      commit_sha: commitSha,
      pushed_sha: pushedSha,
      sync_job_sequence_id: syncJobSequenceId,
      error_code: errorCode,
      error_message: errorMessage,
      mark_started: markStarted,
      mark_completed: markCompleted,
    },
    CourseAgentRunSchema,
  );
}

export async function selectCourseAgentMessages(conversationId: string) {
  return await queryRows(
    sql.select_messages,
    { conversation_id: conversationId },
    CourseAgentMessageSchema,
  );
}

export async function updateCourseAgentAssistantMessage({
  conversationId,
  runId,
  status,
  parts,
  metadata = {},
}: {
  conversationId: string;
  runId: string;
  status: EnumCourseAgentMessageStatus;
  parts: unknown[];
  metadata?: Record<string, unknown>;
}) {
  return await queryRow(
    sql.update_assistant_message,
    {
      conversation_id: conversationId,
      run_id: runId,
      status,
      parts: JSON.stringify(parts),
      metadata: JSON.stringify(metadata),
    },
    CourseAgentMessageSchema,
  );
}

export async function appendCourseAgentEvent({
  conversationId,
  runId,
  eventType,
  data = {},
  externalEventId = randomUUID(),
}: {
  conversationId: string;
  runId: string | null;
  eventType: string;
  data?: Record<string, unknown>;
  externalEventId?: string;
}) {
  return await queryOptionalRow(
    sql.insert_event,
    {
      conversation_id: conversationId,
      run_id: runId,
      external_event_id: externalEventId,
      event_type: eventType,
      data: JSON.stringify(data),
    },
    CourseAgentEventSchema,
  );
}

export async function selectCourseAgentEvents({
  conversationId,
  afterSequence = '0',
  limit = 200,
}: {
  conversationId: string;
  afterSequence?: string;
  limit?: number;
}) {
  return await queryRows(
    sql.select_events,
    { conversation_id: conversationId, after_sequence: afterSequence, limit },
    CourseAgentEventSchema,
  );
}

export async function createCourseAgentWorkspaceBackup({
  conversationId,
  runId,
  sandboxId,
  backupHandle,
  workspaceManifestVersion,
  courseCommitSha,
  reason,
  sizeBytes,
  expiresAt,
}: {
  conversationId: string;
  runId: string | null;
  sandboxId: string;
  backupHandle: unknown;
  workspaceManifestVersion: number;
  courseCommitSha: string | null;
  reason: EnumCourseAgentBackupReason;
  sizeBytes: number | null;
  expiresAt: Date | null;
}) {
  return await queryRow(
    sql.insert_backup,
    {
      conversation_id: conversationId,
      run_id: runId,
      sandbox_id: sandboxId,
      backup_handle: JSON.stringify(backupHandle),
      workspace_manifest_version: workspaceManifestVersion,
      course_commit_sha: courseCommitSha,
      reason,
      size_bytes: sizeBytes,
      expires_at: expiresAt,
    },
    CourseAgentWorkspaceBackupSchema,
  );
}

export async function selectLatestCourseAgentWorkspaceBackup(conversationId: string) {
  return await queryOptionalRow(
    sql.select_latest_backup,
    { conversation_id: conversationId },
    CourseAgentWorkspaceBackupSchema,
  );
}
