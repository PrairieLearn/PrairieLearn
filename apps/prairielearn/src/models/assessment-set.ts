import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { type AssessmentSet, AssessmentSetSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectAssessmentSetById(assessment_set_id: string): Promise<AssessmentSet> {
  return await queryRow(
    sql.select_assessment_set_by_id,
    { assessment_set_id },
    AssessmentSetSchema,
  );
}
