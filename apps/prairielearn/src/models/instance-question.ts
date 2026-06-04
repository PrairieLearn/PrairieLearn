import z from 'zod';

import { loadSqlEquiv, queryOptionalScalar } from '@prairielearn/postgres';

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
