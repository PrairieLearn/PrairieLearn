import { z } from 'zod';

import { execute, loadSqlEquiv, queryRows, runInTransactionAsync } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { IdSchema } from '@prairielearn/zod';

import { StudentLabelSchema } from '../../lib/db-types.js';
import { insertAuditEvent } from '../../models/audit-event.js';
import type { StudentLabelJson } from '../../schemas/infoCourseInstance.js';

const sql = loadSqlEquiv(import.meta.url);

const EnrollmentForLabelDeleteSchema = z.object({
  student_label_enrollment_id: IdSchema,
  enrollment_id: IdSchema,
  student_label_id: IdSchema,
  user_id: IdSchema.nullable(),
  label_name: z.string(),
});

/**
 * Syncs student labels for a course instance from JSON configuration.
 * JSON is always the source of truth:
 * - Labels not in JSON are deleted
 * - Labels in JSON are upserted (insert or update color)
 * - If studentLabels is undefined, all labels are deleted
 *
 * @param courseInstanceId - The ID of the course instance
 * @param studentLabels - The labels from the JSON config, or undefined to delete all
 * @param authnUserId - The authenticated user ID for audit logging (null for system operations)
 */
export async function syncStudentLabels(
  courseInstanceId: string,
  studentLabels: StudentLabelJson[] | undefined,
  authnUserId: string | null = null,
): Promise<Record<string, string>> {
  const desiredLabels = studentLabels ?? [];

  const existingLabels = await queryRows(
    sql.select_student_labels,
    { course_instance_id: courseInstanceId },
    StudentLabelSchema,
  );

  const existingByName = new Map(existingLabels.map((label) => [label.name, label]));
  const desiredByName = new Map(desiredLabels.map((label) => [label.name, label]));

  const labelsToCreate = desiredLabels.filter((label) => !existingByName.has(label.name));
  const labelsToUpdate = desiredLabels.filter((label) => {
    const existing = existingByName.get(label.name);
    return existing && existing.color !== label.color;
  });
  const labelsToDelete = existingLabels
    .filter((label) => !desiredByName.has(label.name))
    .map((label) => label.name);

  const newLabels = await run(async () => {
    if (labelsToCreate.length === 0 && labelsToUpdate.length === 0 && labelsToDelete.length === 0) {
      return [];
    }

    return await runInTransactionAsync(async () => {
      const insertedLabels = await run(async () => {
        if (labelsToCreate.length === 0) return [];

        return queryRows(
          sql.insert_student_labels,
          {
            course_instance_id: courseInstanceId,
            student_labels: labelsToCreate.map((l) => JSON.stringify([l.name, l.color])),
          },
          StudentLabelSchema,
        );
      });

      if (labelsToUpdate.length > 0) {
        await execute(sql.update_student_labels, {
          course_instance_id: courseInstanceId,
          student_labels: labelsToUpdate.map((l) => JSON.stringify([l.name, l.color])),
        });
      }

      if (labelsToDelete.length > 0) {
        // Query affected enrollments before deletion for audit logging
        const affectedEnrollments = await queryRows(
          sql.select_enrollments_for_labels_to_delete,
          {
            course_instance_id: courseInstanceId,
            student_labels: labelsToDelete,
          },
          EnrollmentForLabelDeleteSchema,
        );

        // Delete the labels (this will cascade delete student_label_enrollments)
        await execute(sql.delete_student_labels, {
          course_instance_id: courseInstanceId,
          student_labels: labelsToDelete,
        });

        // Log audit events for each removed enrollment
        for (const enrollment of affectedEnrollments) {
          await insertAuditEvent({
            tableName: 'student_label_enrollments',
            action: 'delete',
            actionDetail: 'enrollment_removed',
            rowId: enrollment.student_label_enrollment_id,
            oldRow: {
              id: enrollment.student_label_enrollment_id,
              enrollment_id: enrollment.enrollment_id,
              student_label_id: enrollment.student_label_id,
            },
            subjectUserId: enrollment.user_id,
            courseInstanceId,
            enrollmentId: enrollment.enrollment_id,
            agentUserId: authnUserId,
            agentAuthnUserId: authnUserId,
            context: { label_name: enrollment.label_name },
          });
        }
      }

      return insertedLabels;
    });
  });

  // Build name to ID map from existing (not deleted) + newly inserted labels
  const nameToIdMap: Record<string, string> = {};

  for (const label of existingLabels) {
    if (!labelsToDelete.includes(label.name)) {
      nameToIdMap[label.name] = label.id;
    }
  }

  for (const label of newLabels) {
    nameToIdMap[label.name] = label.id;
  }

  return nameToIdMap;
}
