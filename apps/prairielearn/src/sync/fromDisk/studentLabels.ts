import { runInTransactionAsync } from '@prairielearn/postgres';

import { type CourseInstance } from '../../lib/db-types.js';
import { insertAuditEvent } from '../../models/audit-event.js';
import {
  createStudentLabel,
  deleteStudentLabel,
  selectEnrollmentsInStudentLabel,
  selectStudentLabelEnrollmentsForLabel,
  selectStudentLabelsInCourseInstance,
  updateStudentLabel,
} from '../../models/student-label.js';
import type { StudentLabelJson } from '../../schemas/infoCourseInstance.js';

/**
 * Syncs student labels for a course instance from JSON configuration.
 * JSON is always the source of truth:
 * - Labels not in JSON are deleted
 * - Labels in JSON are upserted (insert or update name/color)
 * - If studentLabels is undefined, all labels are deleted
 *
 * Matching is done by UUID so that renames preserve enrollments.
 *
 * @param courseInstance - The course instance to sync labels for
 * @param studentLabels - The labels from the JSON config, or undefined to delete all
 * @param authnUserId - The authenticated user ID for audit logging (null for system operations)
 */
export async function syncStudentLabels(
  courseInstance: CourseInstance,
  studentLabels: StudentLabelJson[] | undefined,
  authnUserId: string | null = null,
): Promise<void> {
  const desiredLabels = studentLabels ?? [];

  await runInTransactionAsync(async () => {
    const existingLabels = await selectStudentLabelsInCourseInstance(courseInstance);

    const existingByUuid = new Map(existingLabels.map((label) => [label.uuid, label]));
    const desiredByUuid = new Map(desiredLabels.map((label) => [label.uuid, label]));

    const labelsToCreate = desiredLabels.filter((label) => !existingByUuid.has(label.uuid));
    const labelsToUpdate = desiredLabels.filter((label) => {
      const existing = existingByUuid.get(label.uuid);
      return existing && (existing.name !== label.name || existing.color !== label.color);
    });
    const labelsToDelete = existingLabels.filter((label) => !desiredByUuid.has(label.uuid));

    if (labelsToCreate.length === 0 && labelsToUpdate.length === 0 && labelsToDelete.length === 0) {
      return;
    }

    for (const label of labelsToCreate) {
      await createStudentLabel({
        courseInstanceId: courseInstance.id,
        uuid: label.uuid,
        name: label.name,
        color: label.color,
      });
    }

    for (const label of labelsToUpdate) {
      const existing = existingByUuid.get(label.uuid)!;
      await updateStudentLabel(existing, label.name, label.color);
    }

    for (const label of labelsToDelete) {
      // Query affected enrollments before deletion for audit logging
      const enrollments = await selectEnrollmentsInStudentLabel(label);
      const labelEnrollments = await selectStudentLabelEnrollmentsForLabel(label);

      // Build enrollment_id -> user_id map from enrollments
      const userIdByEnrollmentId = new Map(enrollments.map((e) => [e.id, e.user_id]));

      // Log audit events for each removed enrollment
      for (const sle of labelEnrollments) {
        await insertAuditEvent({
          tableName: 'student_label_enrollments',
          action: 'delete',
          actionDetail: 'enrollment_removed',
          rowId: sle.id,
          oldRow: sle,
          subjectUserId: userIdByEnrollmentId.get(sle.enrollment_id) ?? null,
          courseInstanceId: courseInstance.id,
          enrollmentId: sle.enrollment_id,
          agentUserId: authnUserId,
          agentAuthnUserId: authnUserId,
          context: { label_name: label.name },
        });
      }

      // Delete the label (cascade removes enrollment links)
      await deleteStudentLabel(label);
    }
  });
}
