import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { EnrollmentSchema } from '../lib/db-types';

const sql = loadSqlEquiv(__filename);

export async function insertEnrollment({ course_instance_id, user_id }) {
  await queryRow(sql.insert_enrollment, { course_instance_id, user_id }, EnrollmentSchema);
}
