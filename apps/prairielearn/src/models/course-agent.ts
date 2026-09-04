import type { CourseAgentEvent, CourseAgentSnapshot } from '@prairielearn/course-agent-protocol';
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
  CourseAgentEventSchema,
  CourseAgentMessageSchema,
  CourseAgentRunSchema,
  CourseAgentWorkspaceBackupSchema,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export function selectOptionalCourseAgentConversation({
  conversationId,
  courseId,
  userId,
}: {
  conversationId: string;
  courseId: string;
  userId: string;
}) {
  return queryOptionalRow(
    sql.select_owned_conversation,
    { conversation_id: conversationId, course_id: courseId, user_id: userId },
    CourseAgentConversationSchema,
  );
}

export function selectCourseAgentConversations(courseId: string, userId: string) {
  return queryRows(
    sql.select_owned_conversations,
    { course_id: courseId, user_id: userId },
    CourseAgentConversationSchema,
  );
}

export function selectOptionalRunningCourseAgentRun(conversationId: string) {
  return queryOptionalRow(
    sql.select_running_run,
    { conversation_id: conversationId },
    CourseAgentRunSchema,
  );
}

export async function createCourseAgentTurn({
  conversation,
  runId,
  prompt,
  promptDigest,
}: {
  conversation: Omit<
    CourseAgentConversation,
    'created_at' | 'deleted_at' | 'last_error' | 'updated_at'
  >;
  runId: string;
  prompt: string;
  promptDigest: string;
}) {
  return runInTransactionAsync(async () => {
    const existing = await selectOptionalCourseAgentConversation({
      conversationId: conversation.id,
      courseId: conversation.course_id,
      userId: conversation.user_id,
    });
    const persistedConversation =
      existing ??
      (await queryRow(
        sql.create_conversation,
        {
          conversation_id: conversation.id,
          course_id: conversation.course_id,
          user_id: conversation.user_id,
          title: conversation.title,
          sandbox_id: conversation.sandbox_id,
        },
        CourseAgentConversationSchema,
      ));
    const run = await queryRow(
      sql.create_run,
      { run_id: runId, conversation_id: conversation.id, prompt_digest: promptDigest },
      CourseAgentRunSchema,
    );
    const message = await queryRow(
      sql.insert_user_message,
      {
        conversation_id: conversation.id,
        run_id: runId,
        user_id: conversation.user_id,
        content: prompt,
      },
      CourseAgentMessageSchema,
    );
    return { conversation: persistedConversation, run, message };
  });
}

export async function persistCourseAgentSnapshot({
  snapshot,
  runId,
}: {
  snapshot: CourseAgentSnapshot;
  runId: string;
}) {
  await runInTransactionAsync(async () => {
    let eventRunId = runId;
    for (const event of snapshot.events) {
      if (event.type === 'user.message' && typeof event.data.runId === 'string') {
        eventRunId = event.data.runId;
      }
      await persistEvent(snapshot.conversationId, eventRunId, event);
    }
    await execute(sql.update_runtime, {
      conversation_id: snapshot.conversationId,
      runtime_status: snapshot.status,
      last_error: snapshot.error,
    });
    if (
      !snapshot.activeRunId &&
      ['waiting_for_user', 'failed', 'offline'].includes(snapshot.status)
    ) {
      await execute(sql.complete_run, {
        run_id: runId,
        status: snapshot.error ? 'failed' : 'completed',
        error_message: snapshot.error,
      });
      if (snapshot.response) {
        await execute(sql.insert_assistant_message, {
          conversation_id: snapshot.conversationId,
          run_id: runId,
          content: snapshot.response,
        });
      }
    }
    if (snapshot.workspaceBackup) {
      await queryOptionalRow(
        sql.insert_backup,
        {
          conversation_id: snapshot.conversationId,
          sandbox_id: snapshot.sandboxId,
          backup_handle: JSON.stringify(snapshot.workspaceBackup.handle),
          expires_at: snapshot.workspaceBackup.expiresAt,
        },
        CourseAgentWorkspaceBackupSchema,
      );
    }
  });
}

async function persistEvent(conversationId: string, runId: string, event: CourseAgentEvent) {
  await execute(sql.persist_event, {
    conversation_id: conversationId,
    run_id: runId,
    sequence: event.sequence,
    event_type: event.type,
    data: JSON.stringify(event.data),
    created_at: event.occurredAt,
  });
}

export async function selectCourseAgentHistory(conversationId: string) {
  const [messages, events, backup] = await Promise.all([
    queryRows(sql.select_messages, { conversation_id: conversationId }, CourseAgentMessageSchema),
    queryRows(sql.select_events, { conversation_id: conversationId }, CourseAgentEventSchema),
    queryOptionalRow(
      sql.select_latest_backup,
      { conversation_id: conversationId },
      CourseAgentWorkspaceBackupSchema,
    ),
  ]);
  return { messages, events, backup };
}
