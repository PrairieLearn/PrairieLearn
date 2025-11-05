import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { AiQuestionGenerationMessageSchema } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectAiQuestionGenerationMessages(question_id: string) {
  return await queryRows(
    sql.select_ai_question_generation_messages,
    { question_id },
    AiQuestionGenerationMessageSchema,
  );
}
