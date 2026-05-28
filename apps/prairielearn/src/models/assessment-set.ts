import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import { type AssessmentSet, AssessmentSetSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectAssessmentSetById(assessment_set_id: string): Promise<AssessmentSet> {
  return await queryRow(
    sql.select_assessment_set_by_id,
    { assessment_set_id },
    AssessmentSetSchema,
  );
}

export async function selectAssessmentSetsForCourse(course_id: string): Promise<AssessmentSet[]> {
  return await queryRows(sql.select_assessment_sets_for_course, { course_id }, AssessmentSetSchema);
}
