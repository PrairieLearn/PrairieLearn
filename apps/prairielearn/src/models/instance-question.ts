import z from 'zod';

import { loadSqlEquiv, queryOptionalScalar, queryRows } from '@prairielearn/postgres';

import { AssessmentQuestionSchema, InstanceQuestionSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function computeNextAllowedGradingTimeMs({
  instanceQuestionId,
}: {
  instanceQuestionId: string;
}): Promise<number> {
  const result = await queryOptionalScalar(
    sql.compute_next_allowed_grading_time_ms,
    { instance_question_id: instanceQuestionId },
    z.number().nullable(),
  );
  return result ?? 0;
}

const InstanceQuestionWithAssessmentQuestionSchema = z.object({
  instance_question: InstanceQuestionSchema,
  assessment_question: AssessmentQuestionSchema,
});

/**
 * The assessment's instance questions with the given IDs, each with its assessment question. IDs
 * of other assessments' instance questions are left out.
 */
export async function selectInstanceQuestionsByIdsForAssessment({
  assessment_id,
  instance_question_ids,
}: {
  assessment_id: string;
  instance_question_ids: string[];
}) {
  return await queryRows(
    sql.select_instance_questions_by_ids_for_assessment,
    { assessment_id, instance_question_ids },
    InstanceQuestionWithAssessmentQuestionSchema,
  );
}
