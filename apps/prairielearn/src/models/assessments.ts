import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { AssessmentSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectAssessmentInCourseInstance({
  unsafe_assessment_id,
  course_instance_id,
}) {
  return queryRow(
    sql.select_assessment_in_course_instance,
    {
      unsafe_assessment_id,
      course_instance_id,
    },
    AssessmentSchema,
  );
}
