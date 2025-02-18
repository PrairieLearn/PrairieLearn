import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { type Question, QuestionSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectQuestionById(question_id: string): Promise<Question> {
  return await queryRow(sql.select_question_by_id, { question_id }, QuestionSchema);
}

export async function selectQuestionByUuid({
  course_id,
  uuid,
}: {
  course_id: string;
  uuid: string;
}): Promise<Question> {
  return await queryRow(sql.select_question_by_uuid, { course_id, uuid }, QuestionSchema);
}

export async function selectQuestionByInstanceQuestionId(
  instance_question_id: string,
): Promise<Question> {
  return await queryRow(
    sql.select_question_by_instance_question_id,
    { instance_question_id },
    QuestionSchema,
  );
}
