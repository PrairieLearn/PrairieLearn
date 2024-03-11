import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { Question, QuestionSchema } from '../lib/db-types';

const sql = loadSqlEquiv(__filename);

export async function selectQuestionById(question_id: string): Promise<Question> {
  return await queryRow(
    sql.select_question_by_id,
    {
      question_id,
    },
    QuestionSchema,
  );
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
