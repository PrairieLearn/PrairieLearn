import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import {
  type CourseInstanceAccessControlOverride,
  CourseInstanceAccessControlOverrideSchema,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Finds all access control overrides that apply to a specific enrollment.
 */
export async function selectAccessControlOverridesByEnrollmentId(
  enrollment_id: string,
): Promise<CourseInstanceAccessControlOverride[]> {
  return await queryRows(
    sql.select_access_control_overrides_by_enrollment_id,
    { enrollment_id },
    CourseInstanceAccessControlOverrideSchema,
  );
}
