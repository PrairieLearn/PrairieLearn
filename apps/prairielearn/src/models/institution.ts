import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { Institution, InstitutionSchema } from '../lib/db-types';

const sql = loadSqlEquiv(__filename);

export async function selectInstitutionForCourseInstance({
  course_instance_id,
}: {
  course_instance_id: string;
}): Promise<Institution> {
  return await queryRow(
    sql.select_institution_for_course_instance,
    {
      course_instance_id,
    },
    InstitutionSchema,
  );
}
