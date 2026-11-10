import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { TagSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectTagsByCourseId(course_id: string) {
  return await queryRows(sql.select_tags, { course_id }, TagSchema);
}

export async function selectTagsByQuestionId(question_id: string) {
  return await queryRows(sql.select_tags_by_question_id, { question_id }, TagSchema);
}

export async function selectTagNamesForOtherQuestions({
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
