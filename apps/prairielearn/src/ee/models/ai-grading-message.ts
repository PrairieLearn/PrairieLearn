import { execute, loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { AiGradingMessageSchema } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectAiGradingMessages(assessmentQuestionId: string) {
  return await queryRows(
    sql.select_ai_grading_messages,
    { assessment_question_id: assessmentQuestionId },
    AiGradingMessageSchema,
  );
}

export async function selectAiGradingMessagesByWorkflowRun(workflowRunId: string) {
  return await queryRows(
    sql.select_ai_grading_messages_by_workflow_run,
    { workflow_run_id: workflowRunId },
    AiGradingMessageSchema,
  );
}

export async function deleteAiGradingMessages(assessmentQuestionId: string) {
  await execute(sql.delete_ai_grading_messages, {
    assessment_question_id: assessmentQuestionId,
  });
}
