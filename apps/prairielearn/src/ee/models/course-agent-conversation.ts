import { loadSqlEquiv, queryOptionalRow, queryRow, queryRows } from '@prairielearn/postgres';

import { CourseAgentConversationSchema } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function insertCourseAgentConversation({
  course_id,
  user_id,
  agent_conversation_id,
  title,
}: {
  course_id: string;
  user_id: string;
  agent_conversation_id: string;
  title: string;
}) {
  return await queryRow(
    sql.insert_course_agent_conversation,
    { course_id, user_id, agent_conversation_id, title },
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
