import * as sqldb from '@prairielearn/postgres';

import { SprocSyncStudentLabelsSchema } from '../../lib/db-types.js';
import type { StudentLabelJson } from '../../schemas/infoCourseInstance.js';

/**
 * Syncs student labels for a course instance from JSON configuration.
 * JSON is always the source of truth:
 * - Labels not in JSON are soft-deleted
 * - Labels in JSON are upserted (insert or update name/color)
 * - If studentLabels is undefined, all labels are deleted
 */
export async function syncStudentLabels(
  courseInstanceId: string,
  studentLabels: StudentLabelJson[] | undefined,
): Promise<Record<string, string>> {
  const labels = studentLabels ?? [];

  // Transform data into JSON parameters for the sproc
  const studentLabelParams = labels.map((label) => {
    return JSON.stringify([label.name, label.color]);
  });

  // Single call to stored procedure does all the work
  const result = await sqldb.callRow(
    'sync_student_labels',
    [studentLabelParams, courseInstanceId],
    SprocSyncStudentLabelsSchema,
  );

  return result ?? {};
}
