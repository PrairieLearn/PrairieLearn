import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { type AssessmentModule, AssessmentModuleSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectAssessmentModulesForCourse(
  course_id: string,
): Promise<AssessmentModule[]> {
  return await queryRows(
    sql.select_assessment_modules_for_course,
    { course_id },
    AssessmentModuleSchema,
  );
}
