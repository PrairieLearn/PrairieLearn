import z from 'zod';

import { loadSqlEquiv, queryOptionalScalar, queryRows } from '@prairielearn/postgres';

import { AssessmentQuestionSchema, InstanceQuestionSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/** A question in an attempt, with what staff need to recognize it. */
const InstanceQuestionSummarySchema = z.object({
  instance_question: InstanceQuestionSchema,
  assessment_question: AssessmentQuestionSchema,
  qid: z.string(),
  /** The student whose attempt it is, or null for a group's attempt. */
  user_uid: z.string().nullable(),
  group_name: z.string().nullable(),
  assigned_grader_uid: z.string().nullable(),
});
export type InstanceQuestionSummary = z.infer<typeof InstanceQuestionSummarySchema>;

/** The assessment's own instance questions among `instance_question_ids`. */
export async function selectInstanceQuestionSummariesByIds({
  assessment_id,
  instance_question_ids,
}: {
  assessment_id: string;
  instance_question_ids: string[];
}): Promise<InstanceQuestionSummary[]> {
  return await queryRows(
    sql.select_instance_question_summaries_by_ids,
    { assessment_id, instance_question_ids },
    InstanceQuestionSummarySchema,
  );
}

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
