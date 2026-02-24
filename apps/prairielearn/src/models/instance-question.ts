import z from 'zod';

import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export async function computeNextAllowedGradingTimeMs({
  instanceQuestionId,
}: {
  instanceQuestionId: string;
}): Promise<number> {
  return (
    (await queryOptionalRow(
      sql.compute_next_allowed_grading_time_ms,
      { instance_question_id: instanceQuestionId },
      z.number().optional(),
    )) ?? 0
  );
}
