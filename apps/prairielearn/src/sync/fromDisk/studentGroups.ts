import * as sqldb from '@prairielearn/postgres';

import { SprocSyncStudentGroupsSchema } from '../../lib/db-types.js';
import type { StudentGroupJson } from '../../schemas/infoCourseInstance.js';

/**
 * Syncs student groups for a course instance from JSON configuration.
 * JSON is always the source of truth:
 * - Groups not in JSON are soft-deleted
 * - Groups in JSON are upserted (insert or update name/color)
 * - If studentGroups is undefined, all groups are deleted
 */
export async function syncStudentGroups(
  courseInstanceId: string,
  studentGroups: StudentGroupJson[] | undefined,
): Promise<Record<string, string>> {
  const groups = studentGroups ?? [];

  // Transform data into JSON parameters for the sproc
  const studentGroupParams = groups.map((group) => {
    return JSON.stringify([group.name, group.color]);
  });

  // Single call to stored procedure does all the work
  const result = await sqldb.callRow(
    'sync_student_groups',
    [studentGroupParams, courseInstanceId],
    SprocSyncStudentGroupsSchema,
  );

  return result ?? {};
}
