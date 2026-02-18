import { execute, runInTransactionAsync } from '@prairielearn/postgres';

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

    // Defer the name uniqueness constraint so that label name swaps don't
    // cause intermediate constraint violations.
    // If we end up doing this in other places, we should add a helper function to the postgres library.
    await execute('SET CONSTRAINTS student_labels_course_instance_id_name_key DEFERRED;');

    for (const label of labelsToCreate) {
      await createStudentLabel({
        courseInstance,
        uuid: label.uuid,
        name: label.name,
        color: label.color,
      });
    }

    for (const label of labelsToUpdate) {
      const existing = existingByUuid.get(label.uuid)!;
      await updateStudentLabel({ label: existing, name: label.name, color: label.color });
    }

    for (const label of labelsToDelete) {
      const enrollments = await selectEnrollmentsInStudentLabel(label);
      const labelEnrollments = await selectStudentLabelEnrollmentsForLabel(label);

      const userIdByEnrollmentId = new Map(enrollments.map((e) => [e.id, e.user_id]));

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

      await deleteStudentLabel(label);
    }
  });
}
