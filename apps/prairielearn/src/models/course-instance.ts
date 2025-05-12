import { z } from 'zod';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export async function selectCourseInstanceIsPublic(course_instance_id: string): Promise<boolean> {
  const isPublic = await queryRow(
    sql.check_course_instance_is_public,
    { course_instance_id },
    z.boolean(),
  );
  return isPublic;
}
