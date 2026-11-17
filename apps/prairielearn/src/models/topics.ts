import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { TopicSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectTopicsByCourseId(course_id: string) {
  return await queryRows(sql.select_topics, { course_id }, TopicSchema);
}

export async function selectTopicNamesForOtherQuestions({
  course_id,
  question_id,
}: {
  course_id: string;
  question_id: string;
}): Promise<string[]> {
  const rows = await queryRows(
    sql.select_names_for_other_questions,
    { course_id, question_id },
    z.object({ name: z.string() }),
  );
  return rows.map((row) => row.name);
}
