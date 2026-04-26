import * as sqldb from '@prairielearn/postgres';

import {
  type StaffAssessmentQuestionRow,
  StaffAssessmentQuestionRowSchema,
  StaffAssessmentQuestionSqlSchema,
} from './assessment-question.shared.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function selectAssessmentQuestions({
  assessment_id,
}: {
  assessment_id: string;
}): Promise<StaffAssessmentQuestionRow[]> {
  const rows = await sqldb.queryRows(
    sql.select_assessment_questions,
    { assessment_id },
    StaffAssessmentQuestionSqlSchema,
  );

  const poolCounts: Record<string, number> = {};
  for (const row of rows) {
    const poolId = row.alternative_pool.id;
    poolCounts[poolId] = (poolCounts[poolId] || 0) + 1;
  }
  let prevZoneId: string | null = null;
  let prevAltPoolId: string | null = null;

  const result: StaffAssessmentQuestionRow[] = [];
  for (const row of rows) {
    const start_new_zone = row.zone.id !== prevZoneId;
    const start_new_alternative_pool = row.alternative_pool.id !== prevAltPoolId;
    const alternative_pool_size = poolCounts[row.alternative_pool.id];
    result.push(
      StaffAssessmentQuestionRowSchema.parse({
        ...row,
        start_new_zone,
        start_new_alternative_pool,
        alternative_pool_size,
      }),
    );
    prevZoneId = row.zone.id;
    prevAltPoolId = row.alternative_pool.id;
  }
  return result;
}
