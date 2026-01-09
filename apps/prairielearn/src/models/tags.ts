import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { TagSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectTagsByCourseId(course_id: string) {
  return await queryRows(sql.select_tags, { course_id }, TagSchema);
}

export async function selectTagsByQuestionId(question_id: string) {
  return await queryRows(sql.select_tags_by_question_id, { question_id }, TagSchema);
}
