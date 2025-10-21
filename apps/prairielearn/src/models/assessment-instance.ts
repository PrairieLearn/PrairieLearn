import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { AssessmentInstanceSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectAssessmentInstanceById(assessment_instance_id: string) {
  return queryRow(
    sql.select_assessment_instance_by_id,
    { assessment_instance_id },
    AssessmentInstanceSchema,
  );
}
