import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { Question, QuestionSchema } from '../lib/db-types';

const sql = loadSqlEquiv(__filename);

export async function selectQuestion({
  question_id,
}: {
  question_id: string;
}): Promise<Question> {
  return await queryRow(
    sql.select_question,
    {
      question_id,
    },
    QuestionSchema,
  );
}
