import { loadSqlEquiv, queryRow, queryRows, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type Institution, InstitutionSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectInstitutionForCourse({
  course_id,
}: {
  course_id: string;
}): Promise<Institution> {
  return await queryRow(sql.select_institution_for_course, { course_id }, InstitutionSchema);
}

export async function selectInstitutionForCourseInstance({
  course_instance_id,
}: {
  course_instance_id: string;
}): Promise<Institution> {
  return await queryRow(
    sql.select_institution_for_course_instance,
    { course_instance_id },
    InstitutionSchema,
  );
}

export async function selectAllInstitutions() {
  return await queryRows(sql.select_all_institutions, InstitutionSchema);
}

export async function insertInstitution({
  shortName,
  longName,
  displayTimezone,
  uidRegexp,
}: {
  shortName: string;
  longName: string;
  displayTimezone: string;
  uidRegexp: string | null;
}) {
  return await queryScalar(
    sql.insert_institution,
    {
      short_name: shortName,
      long_name: longName,
      display_timezone: displayTimezone,
      uid_regexp: uidRegexp || null,
    },
    IdSchema,
  );
}
