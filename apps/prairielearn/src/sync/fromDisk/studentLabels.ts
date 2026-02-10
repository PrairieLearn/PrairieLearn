import { runInTransactionAsync } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { type CourseInstance } from '../../lib/db-types.js';
import { insertAuditEvent } from '../../models/audit-event.js';
import {
  createStudentLabel,
  deleteStudentLabel,
  selectEnrollmentsInStudentLabel,
  selectStudentLabelEnrollmentsForLabel,
  selectStudentLabelsInCourseInstance,
  updateStudentLabelColor,
} from '../../models/student-label.js';
import type { StudentLabelJson } from '../../schemas/infoCourseInstance.js';

/**
 * Syncs student labels for a course instance from JSON configuration.
 * JSON is always the source of truth:
 * - Labels not in JSON are deleted
 * - Labels in JSON are upserted (insert or update color)
 * - If studentLabels is undefined, all labels are deleted
 *
 * @param courseInstance - The course instance to sync labels for
 * @param studentLabels - The labels from the JSON config, or undefined to delete all
 * @param authnUserId - The authenticated user ID for audit logging (null for system operations)
 */
export async function syncStudentLabels(
  courseInstance: CourseInstance,
  studentLabels: StudentLabelJson[] | undefined,
  authnUserId: string | null = null,
): Promise<Record<string, string>> {
  const desiredLabels = studentLabels ?? [];

  return await runInTransactionAsync(async () => {
    const existingLabels = await selectStudentLabelsInCourseInstance(courseInstance);

    const existingByName = new Map(existingLabels.map((label) => [label.name, label]));
    const desiredByName = new Map(desiredLabels.map((label) => [label.name, label]));

    const labelsToCreate = desiredLabels.filter((label) => !existingByName.has(label.name));
    const labelsToUpdate = desiredLabels.filter((label) => {
      const existing = existingByName.get(label.name);
      return existing && existing.color !== label.color;
    });
    const labelsToDelete = existingLabels.filter((label) => !desiredByName.has(label.name));

    if (labelsToCreate.length === 0 && labelsToUpdate.length === 0 && labelsToDelete.length === 0) {
      // Build name to ID map from existing labels (nothing changed)
      const nameToIdMap: Record<string, string> = {};
      for (const label of existingLabels) {
        nameToIdMap[label.name] = label.id;
      }
      return nameToIdMap;
    }

    const insertedLabels = await run(async () => {
      if (labelsToCreate.length === 0) return [];

      const results = [];
      for (const label of labelsToCreate) {
        results.push(
          await createStudentLabel({
            courseInstanceId: courseInstance.id,
            name: label.name,
            color: label.color,
          }),
        );
      }
      return results;
    });

    for (const label of labelsToUpdate) {
      const existing = existingByName.get(label.name)!;
      await updateStudentLabelColor(existing, label.color);
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

    // Build name to ID map from existing (not deleted) + newly inserted labels
    const nameToIdMap: Record<string, string> = {};
    const deletedIds = new Set(labelsToDelete.map((l) => l.id));

    for (const label of existingLabels) {
      if (!deletedIds.has(label.id)) {
        nameToIdMap[label.name] = label.id;
      }
    }

    for (const label of insertedLabels) {
      nameToIdMap[label.name] = label.id;
    }

    return nameToIdMap;
  });
}
