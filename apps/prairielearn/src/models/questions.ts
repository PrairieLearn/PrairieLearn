import * as sqldb from '@prairielearn/postgres';

import { idsEqual } from '../lib/id.js';

import { type QuestionsPageData, QuestionsPageDataSchema } from './questions.types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function selectQuestionsForCourse(
  course_id: string | number,
  course_instance_ids: string[],
): Promise<QuestionsPageData[]> {
  const rows = await sqldb.queryRows(
    sql.select_questions_for_course,
    { course_id },
    QuestionsPageDataSchema,
  );

  const questions = rows.map((row) => ({
    ...row,
    assessments:
      row.assessments?.filter((assessment) =>
        course_instance_ids.some((id) => idsEqual(id, assessment.course_instance_id)),
      ) ?? null,
  }));
  return questions;
}

export async function selectPublicQuestionsForCourse(
  course_id: string | number,
): Promise<QuestionsPageData[]> {
  const rows = await sqldb.queryRows(
    sql.select_public_questions_for_course,
    { course_id },
    QuestionsPageDataSchema,
  );

  return rows;
}
