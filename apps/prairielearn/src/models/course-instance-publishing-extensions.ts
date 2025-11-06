import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { type AuthzData, assertHasRole } from '../lib/authz-data-lib.js';
import { CourseInstancePublishingExtensionSchema, type Enrollment } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Finds the latest publishing extension that applies to a specific enrollment.
 */
export async function selectLatestPublishingExtensionByEnrollment({
  enrollment,
  authzData,
  requestedRole,
}: {
  enrollment: Enrollment;
  authzData: AuthzData;
  requestedRole: 'System' | 'Student' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
}) {
  assertHasRole(authzData, requestedRole);
  return await queryOptionalRow(
    sql.select_latest_publishing_extension_by_enrollment_id,
    { enrollment_id: enrollment.id },
    CourseInstancePublishingExtensionSchema,
  );
}
