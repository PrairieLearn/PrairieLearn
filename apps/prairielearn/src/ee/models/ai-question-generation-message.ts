import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { AiQuestionGenerationMessageSchema, type Question } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectAiQuestionGenerationMessages(question: Question) {
  return await queryRows(
    sql.select_ai_question_generation_messages,
    { question_id: question.id },
    AiQuestionGenerationMessageSchema,
  );
}

export async function selectAiQuestionGenerationContextMessages(question: Question) {
  return await queryRows(
    sql.select_ai_question_generation_context_messages,
    { question_id: question.id },
    AiQuestionGenerationMessageSchema,
  );
}
