import type { CourseActionCard } from '@prairielearn/course-agent-types';
import { execute, loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { CourseAgentActionSchema } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/** A request ID is used once in a conversation; the table's unique constraint rejects a repeat. */
export async function insertCourseAgentAction({
  course_agent_conversation_id,
  agent_action_id,
  action,
  input,
  card,
}: {
  course_agent_conversation_id: string;
  agent_action_id: string;
  action: string;
  input: unknown;
  card: CourseActionCard;
}) {
  await execute(sql.insert_course_agent_action, {
    course_agent_conversation_id,
    agent_action_id,
    action,
    input: JSON.stringify(input),
    card: JSON.stringify(card),
  });
}

export async function selectOptionalCourseAgentAction({
  course_agent_conversation_id,
  agent_action_id,
}: {
  course_agent_conversation_id: string;
  agent_action_id: string;
}) {
  return await queryOptionalRow(
    sql.select_course_agent_action,
    { course_agent_conversation_id, agent_action_id },
    CourseAgentActionSchema,
  );
}
