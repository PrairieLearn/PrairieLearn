import { z } from 'zod';

import { loadSqlEquiv, queryCursor, queryRow, queryRows } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export async function selectCourseInstanceIsPublic(course_instance_id: string): Promise<boolean> {
  const isPublic = await queryRow(
    sql.check_course_instance_is_public,
    { course_instance_id },
    z.boolean(),
  );
  return isPublic;
}

export async function selectAssessments(
  {
    course_instance_id,
    assessments_group_by,
  }: {
    course_instance_id: string;
    assessments_group_by: 'Set' | 'Module';
  },
  schema: z.ZodTypeAny,
) {
  return queryRows(sql.select_assessments, { course_instance_id, assessments_group_by }, schema);
}

export function selectAssessmentsCursor({
  course_instance_id,
  assessments_group_by,
}: {
  course_instance_id: string;
  assessments_group_by: 'Set' | 'Module';
}) {
  return queryCursor(sql.select_assessments, { course_instance_id, assessments_group_by });
}
