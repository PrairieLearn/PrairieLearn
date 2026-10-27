import type { UsageDelta } from '@prairielearn/course-agent-types';
import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';

import { CourseAgentConversationSchema } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const DEFAULT_COURSE_AGENT_CONVERSATION_TITLE = 'New conversation';

export async function addCourseAgentConversationUsage(id: string, usage: UsageDelta) {
  await execute(sql.add_usage, {
    id,
    input: usage.inputTokens,
    cached: usage.cachedInputTokens,
    output: usage.outputTokens,
    reasoning: usage.reasoningTokens,
    cost: usage.costMilliDollars,
  });
}

export async function selectOptionalCourseAgentConversationByAgentId(
  agentConversationId: string,
  { includeDeletedCourse = false }: { includeDeletedCourse?: boolean } = {},
) {
  return queryOptionalRow(
    sql.select_course_agent_conversation_by_agent_id,
    { agent_conversation_id: agentConversationId, include_deleted_course: includeDeletedCourse },
    CourseAgentConversationSchema,
  );
}

export async function insertCourseAgentConversation({
  course_id,
  user_id,
  agent_conversation_id,
}: {
  course_id: string;
  user_id: string;
  agent_conversation_id: string;
}) {
  return await queryRow(
    sql.insert_course_agent_conversation,
    { course_id, user_id, agent_conversation_id, title: DEFAULT_COURSE_AGENT_CONVERSATION_TITLE },
    CourseAgentConversationSchema,
  );
}

export async function selectCourseAgentConversationsForUser({
  course_id,
  user_id,
}: {
  course_id: string;
  user_id: string;
}) {
  return await queryRows(
    sql.select_course_agent_conversations_for_user,
    { course_id, user_id },
    CourseAgentConversationSchema,
  );
}

/**
 * Returns the conversation only if it belongs to the given course and user, so
 * callers can treat a `null` result as "not found" for authorization.
 */
export async function selectOptionalCourseAgentConversation({
  id,
  course_id,
  user_id,
}: {
  id: string;
  course_id: string;
  user_id: string;
}) {
  return await queryOptionalRow(
    sql.select_course_agent_conversation,
    { id, course_id, user_id },
    CourseAgentConversationSchema,
  );
}

/** Sets the title unless the conversation already has a non-default one. */
export async function updateCourseAgentConversationTitleIfDefault({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  await execute(sql.update_course_agent_conversation_title_if_default, {
    id,
    title,
    default_title: DEFAULT_COURSE_AGENT_CONVERSATION_TITLE,
  });
}
