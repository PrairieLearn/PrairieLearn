import { loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { type Assessment, AssessmentSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export function selectAssessmentById(assessment_id: string): Promise<Assessment> {
  return queryRow(sql.select_assessment_by_id, { assessment_id }, AssessmentSchema);
}

export function selectOptionalAssessmentById(assessment_id: string): Promise<Assessment | null> {
  return queryOptionalRow(sql.select_assessment_by_id, { assessment_id }, AssessmentSchema);
}
