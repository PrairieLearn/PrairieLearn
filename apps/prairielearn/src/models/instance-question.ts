import z from 'zod';

import { loadSqlEquiv, queryOptionalScalar, queryRow } from '@prairielearn/postgres';

import { type InstanceQuestion, InstanceQuestionSchema } from '../lib/db-types.js';

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

/**
 * Selects the (unique) instance question for an assessment question within a
 * specific assessment instance.
 */
export async function selectInstanceQuestionForAssessmentInstance({
  assessment_instance_id,
  assessment_question_id,
}: {
  assessment_instance_id: string;
  assessment_question_id: string;
}): Promise<InstanceQuestion> {
  return await queryRow(
    sql.select_instance_question_for_assessment_instance,
    { assessment_instance_id, assessment_question_id },
    InstanceQuestionSchema,
  );
}
