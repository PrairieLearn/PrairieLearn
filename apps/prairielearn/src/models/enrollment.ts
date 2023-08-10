import { loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';
import { Enrollment, EnrollmentSchema } from '../lib/db-types';

const sql = loadSqlEquiv(__filename);

export async function insertEnrollment({
  course_instance_id,
  user_id,
}: {
  course_instance_id: string;
  user_id: string;
}): Promise<Enrollment> {
  return await queryRow(sql.insert_enrollment, { course_instance_id, user_id }, EnrollmentSchema);
}

export async function getEnrollmentForUserInCourseInstance({
  user_id,
  course_instance_id,
}): Promise<Enrollment | null> {
  return await queryOptionalRow(
    sql.select_enrollment_for_user_in_course_instance,
    { user_id, course_instance_id },
    EnrollmentSchema,
  );
}
