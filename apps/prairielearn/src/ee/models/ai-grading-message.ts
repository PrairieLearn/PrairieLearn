import { execute, loadSqlEquiv, queryOptionalRow, queryRows } from '@prairielearn/postgres';

import { AiGradingMessageSchema } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectAiGradingMessages(assessmentQuestionId: string) {
  return await queryRows(
    sql.select_ai_grading_messages,
    { assessment_question_id: assessmentQuestionId },
    AiGradingMessageSchema,
  );
}

export async function deleteAiGradingMessages(assessmentQuestionId: string) {
  await execute(sql.delete_ai_grading_messages, {
    assessment_question_id: assessmentQuestionId,
  });
}

export async function deleteAiGradingMessagesByIds(assessmentQuestionId: string, ids: string[]) {
  await execute(sql.delete_ai_grading_messages_by_ids, {
    assessment_question_id: assessmentQuestionId,
    ids,
  });
}

export async function selectLatestStreamingAiGradingMessage(assessmentQuestionId: string) {
  return await queryOptionalRow(
    sql.select_latest_streaming_ai_grading_message,
    { assessment_question_id: assessmentQuestionId },
    AiGradingMessageSchema,
  );
}

export async function cancelLatestStreamingAiGradingMessage(assessmentQuestionId: string) {
  await execute(sql.cancel_latest_streaming_ai_grading_message, {
    assessment_question_id: assessmentQuestionId,
  });
}

export async function selectFirstAiGradingMessage(assessmentQuestionId: string) {
  return await queryOptionalRow(
    sql.select_first_ai_grading_message,
    { assessment_question_id: assessmentQuestionId },
    AiGradingMessageSchema,
  );
}
