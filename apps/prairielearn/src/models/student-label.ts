import assert from 'node:assert';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryRow, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { type AuthzData } from '../lib/authz-data-lib.js';
import {
  type CourseInstance,
  type Enrollment,
  EnrollmentSchema,
  type StudentLabel,
  type StudentLabelEnrollment,
  StudentLabelEnrollmentSchema,
  StudentLabelSchema,
} from '../lib/db-types.js';
import type { ColorJson } from '../schemas/infoCourse.js';

import { insertAuditEvent } from './audit-event.js';

const sql = loadSqlEquiv(import.meta.url);

function assertLabelMatchesCourseInstance(
  label: StudentLabel,
  courseInstance: CourseInstance,
): void {
  if (label.course_instance_id !== courseInstance.id) {
    throw new HttpStatusError(403, 'Label does not belong to this course instance');
  }
}

function assertEnrollmentMatchesLabel(enrollment: Enrollment, label: StudentLabel): void {
  if (enrollment.course_instance_id !== label.course_instance_id) {
    throw new HttpStatusError(
      400,
      'Enrollment does not belong to the same course instance as the label',
    );
  }
}

/**
 * Creates a new student label in the given course instance.
 * Should only be called by sync code and tests.
 */
export async function createStudentLabel({
  courseInstance,
  uuid,
  name,
  color,
}: {
  courseInstance: CourseInstance;
  uuid: string;
  name: string;
  color: ColorJson;
}): Promise<StudentLabel> {
  return await queryRow(
    sql.create_student_label,
    { course_instance_id: courseInstance.id, uuid, name, color },
    StudentLabelSchema,
  );
}

/**
 * Selects all student labels for a given course instance.
 */
export async function selectStudentLabelsInCourseInstance(
  courseInstance: CourseInstance,
): Promise<StudentLabel[]> {
  return await queryRows(
    sql.select_student_labels_by_course_instance,
    { course_instance_id: courseInstance.id },
    StudentLabelSchema,
  );
}

/**
 * Selects a student label by its ID.
 */
export async function selectStudentLabelById({
  id,
  courseInstance,
}: {
  id: string;
  courseInstance: CourseInstance;
}): Promise<StudentLabel> {
  const label = await queryRow(sql.select_student_label_by_id, { id }, StudentLabelSchema);
  assertLabelMatchesCourseInstance(label, courseInstance);
  return label;
}

/**
 * Deletes a student label.
 *
 * Should only be called by sync code and tests.
 */
export async function deleteStudentLabel(label: StudentLabel): Promise<StudentLabel> {
  return await queryRow(sql.delete_student_label, { id: label.id }, StudentLabelSchema);
}

/**
 * Adds a label to an enrollment. If the enrollment already has this label,
 * this is a no-op.
 */
export async function addLabelToEnrollment({
  enrollment,
  label,
  authzData,
}: {
  enrollment: Enrollment;
  label: StudentLabel;
  authzData: AuthzData;
}): Promise<StudentLabelEnrollment | null> {
  const results = await addLabelToEnrollments({
    enrollments: [enrollment],
    label,
    authzData,
  });
  return results[0] ?? null;
}

/**
 * Removes a label from an enrollment.
 */
export async function removeLabelFromEnrollment({
  enrollment,
  label,
  authzData,
}: {
  enrollment: Enrollment;
  label: StudentLabel;
  authzData: AuthzData;
}): Promise<StudentLabelEnrollment | null> {
  const results = await removeLabelFromEnrollments({
    enrollments: [enrollment],
    label,
    authzData,
  });
  return results[0] ?? null;
}

/**
 * Adds a label to multiple enrollments in a single operation.
 * Returns the enrollments that received the label (those that didn't already have it).
 */
export async function addLabelToEnrollments({
  enrollments,
  label,
  authzData,
}: {
  enrollments: Enrollment[];
  label: StudentLabel;
  authzData: AuthzData;
}): Promise<StudentLabelEnrollment[]> {
  if (enrollments.length === 0) {
    return [];
  }

  for (const enrollment of enrollments) {
    assertEnrollmentMatchesLabel(enrollment, label);
  }

  return await runInTransactionAsync(async () => {
    const results = await queryRows(
      sql.add_label_to_enrollments,
      { enrollment_ids: enrollments.map((e) => e.id), student_label_id: label.id },
      StudentLabelEnrollmentSchema,
    );

    const enrollmentMap = new Map(enrollments.map((e) => [e.id, e]));

    for (const result of results) {
      const enrollment = enrollmentMap.get(result.enrollment_id);
      assert(enrollment);
      await insertAuditEvent({
        tableName: 'student_label_enrollments',
        action: 'insert',
        actionDetail: 'enrollment_added',
        rowId: result.id,
        newRow: result,
        subjectUserId: enrollment.user_id ?? null,
        courseInstanceId: label.course_instance_id,
        enrollmentId: result.enrollment_id,
        agentUserId: authzData.user.id,
        agentAuthnUserId: 'authn_user' in authzData ? authzData.authn_user.id : authzData.user.id,
        context: { label_name: label.name },
      });
    }

    return results;
  });
}

/**
 * Removes a label from multiple enrollments in a single operation.
 * Returns the enrollments that had the label removed.
 */
export async function removeLabelFromEnrollments({
  enrollments,
  label,
  authzData,
}: {
  enrollments: Enrollment[];
  label: StudentLabel;
  authzData: AuthzData;
}): Promise<StudentLabelEnrollment[]> {
  if (enrollments.length === 0) {
    return [];
  }

  for (const enrollment of enrollments) {
    assertEnrollmentMatchesLabel(enrollment, label);
  }

  return await runInTransactionAsync(async () => {
    const deletedRows = await queryRows(
      sql.remove_label_from_enrollments,
      { enrollment_ids: enrollments.map((e) => e.id), student_label_id: label.id },
      StudentLabelEnrollmentSchema,
    );

    const enrollmentMap = new Map(enrollments.map((e) => [e.id, e]));

    for (const deletedRow of deletedRows) {
      const enrollment = enrollmentMap.get(deletedRow.enrollment_id);
      assert(enrollment);
      await insertAuditEvent({
        tableName: 'student_label_enrollments',
        action: 'delete',
        actionDetail: 'enrollment_removed',
        rowId: deletedRow.id,
        oldRow: deletedRow,
        subjectUserId: enrollment.user_id ?? null,
        courseInstanceId: label.course_instance_id,
        enrollmentId: deletedRow.enrollment_id,
        agentUserId: authzData.user.id,
        agentAuthnUserId: 'authn_user' in authzData ? authzData.authn_user.id : authzData.user.id,
        context: { label_name: label.name },
      });
    }

    return deletedRows;
  });
}

/**
 * Selects all enrollments that have a given student label.
 */
export async function selectEnrollmentsInStudentLabel(label: StudentLabel): Promise<Enrollment[]> {
  return await queryRows(
    sql.select_enrollments_in_student_label,
    { student_label_id: label.id },
    EnrollmentSchema,
  );
}

/**
 * Selects all student labels that an enrollment has.
 */
export async function selectStudentLabelsForEnrollment(
  enrollment: Enrollment,
): Promise<StudentLabel[]> {
  return await queryRows(
    sql.select_student_labels_for_enrollment,
    { enrollment_id: enrollment.id },
    StudentLabelSchema,
  );
}

/**
 * Updates the name and color of a student label.
 *
 * Should only be called by sync code and tests.
 */
export async function updateStudentLabel({
  label,
  name,
  color,
}: {
  label: StudentLabel;
  name: string;
  color: ColorJson;
}): Promise<StudentLabel> {
  return await queryRow(
    sql.update_student_label,
    { id: label.id, name, color },
    StudentLabelSchema,
  );
}

/**
 * Selects all student_label_enrollments rows for a given label.
 */
export async function selectStudentLabelEnrollmentsForLabel(
  label: StudentLabel,
): Promise<StudentLabelEnrollment[]> {
  return await queryRows(
    sql.select_student_label_enrollments_for_label,
    { student_label_id: label.id },
    StudentLabelEnrollmentSchema,
  );
}
