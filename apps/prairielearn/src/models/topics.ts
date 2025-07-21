import { loadSqlEquiv, queryOptionalRow, queryRows } from '@prairielearn/postgres';

import { TopicSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectTopicsByCourseId(course_id: string) {
  return await queryRows(sql.select_topics, { course_id }, TopicSchema);
}

export async function selectOptionalTopicByName({
  course_id,
  name,
}: {
  course_id: string;
  name: string;
}) {
  return await queryOptionalRow(sql.select_topic_by_name, { course_id, name }, TopicSchema);
}
