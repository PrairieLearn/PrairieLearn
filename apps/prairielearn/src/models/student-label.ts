import assert from 'node:assert';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryOptionalRow, queryRow, queryRows } from '@prairielearn/postgres';

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

import { insertAuditEvent } from './audit-event.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Creates a new student label in the given course instance.
 *
 * This should ONLY be called for testing.
 */
export async function createStudentLabel({
  courseInstanceId,
  name,
  color = 'gray1',
}: {
  courseInstanceId: string;
  name: string;
  color?: string;
}): Promise<StudentLabel> {
  assert(process.env.NODE_ENV === 'test');
  return await queryRow(
    sql.create_student_label,
    { course_instance_id: courseInstanceId, name, color },
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
  const label = await queryOptionalRow(sql.select_student_label_by_id, { id }, StudentLabelSchema);
  if (!label) {
    throw new HttpStatusError(404, 'Label not found');
  }
  if (label.course_instance_id !== courseInstance.id) {
    throw new HttpStatusError(403, 'Label does not belong to this course instance');
  }
  return label;
}

/**
 * Deletes a student label.
 *
 * This should ONLY be called for testing.
 */
export async function deleteStudentLabel(id: string): Promise<StudentLabel> {
  assert(process.env.NODE_ENV === 'test');
  return await queryRow(sql.delete_student_label, { id }, StudentLabelSchema);
}

/**
 * Adds a label to an enrollment. If the enrollment already has this label,
 * this is a no-op.
 *
 * Callers must ensure that the enrollment belongs to the same course instance as the label.
 */
export async function addEnrollmentToStudentLabel({
  enrollment,
  label,
  authzData,
}: {
  enrollment: Enrollment;
  label: StudentLabel;
  authzData: AuthzData;
}): Promise<StudentLabelEnrollment | null> {
  const result = await queryOptionalRow(
    sql.add_enrollment_to_student_label,
    { enrollment_id: enrollment.id, student_label_id: label.id },
    StudentLabelEnrollmentSchema,
  );

  if (result) {
    await insertAuditEvent({
      tableName: 'student_label_enrollments',
      action: 'insert',
      actionDetail: 'enrollment_added',
      rowId: result.id,
      newRow: result,
      subjectUserId: enrollment.user_id,
      courseInstanceId: label.course_instance_id,
      enrollmentId: enrollment.id,
      agentUserId: authzData.user.id,
      agentAuthnUserId: 'authn_user' in authzData ? authzData.authn_user.id : authzData.user.id,
      context: { label_name: label.name },
    });
  }

  return result;
}

/**
 * Removes a label from an enrollment.
 *
 * Callers must ensure that the enrollment belongs to the same course instance as the label.
 */
export async function removeEnrollmentFromStudentLabel({
  enrollment,
  label,
  authzData,
}: {
  enrollment: Enrollment;
  label: StudentLabel;
  authzData: AuthzData;
}): Promise<StudentLabelEnrollment | null> {
  const deletedRow = await queryOptionalRow(
    sql.remove_enrollment_from_student_label,
    {
      enrollment_id: enrollment.id,
      student_label_id: label.id,
    },
    StudentLabelEnrollmentSchema,
  );

  if (deletedRow) {
    await insertAuditEvent({
      tableName: 'student_label_enrollments',
      action: 'delete',
      actionDetail: 'enrollment_removed',
      rowId: deletedRow.id,
      oldRow: deletedRow,
      subjectUserId: enrollment.user_id,
      courseInstanceId: label.course_instance_id,
      enrollmentId: enrollment.id,
      agentUserId: authzData.user.id,
      agentAuthnUserId: 'authn_user' in authzData ? authzData.authn_user.id : authzData.user.id,
      context: { label_name: label.name },
    });
  }

  return deletedRow;
}

/**
 * Adds a label to multiple enrollments in a single operation.
 * Returns the enrollments that received the label (those that didn't already have it).
 *
 * Callers must ensure that all enrollments belong to the same course instance as the label.
 */
export async function addEnrollmentsToStudentLabel({
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

  const results = await queryRows(
    sql.add_enrollments_to_student_label,
    { enrollment_ids: enrollments.map((e) => e.id), student_label_id: label.id },
    StudentLabelEnrollmentSchema,
  );

  // Create a map of enrollment_id to enrollment for quick lookup
  const enrollmentMap = new Map(enrollments.map((e) => [e.id, e]));

  // Log audit events for each added enrollment
  for (const result of results) {
    const enrollment = enrollmentMap.get(result.enrollment_id);
    await insertAuditEvent({
      tableName: 'student_label_enrollments',
      action: 'insert',
      actionDetail: 'enrollment_added',
      rowId: result.id,
      newRow: result,
      subjectUserId: enrollment?.user_id ?? null,
      courseInstanceId: label.course_instance_id,
      enrollmentId: result.enrollment_id,
      agentUserId: authzData.user.id,
      agentAuthnUserId: 'authn_user' in authzData ? authzData.authn_user.id : authzData.user.id,
      context: { label_name: label.name },
    });
  }

  return results;
}

/**
 * Removes a label from multiple enrollments in a single operation.
 * Returns the count of enrollments that had the label removed.
 *
 * Callers must ensure that all enrollments belong to the same course instance as the label.
 */
export async function removeEnrollmentsFromStudentLabel({
  enrollments,
  label,
  authzData,
}: {
  enrollments: Enrollment[];
  label: StudentLabel;
  authzData: AuthzData;
}): Promise<number> {
  if (enrollments.length === 0) {
    return 0;
  }

  const deletedRows = await queryRows(
    sql.remove_enrollments_from_student_label,
    { enrollment_ids: enrollments.map((e) => e.id), student_label_id: label.id },
    StudentLabelEnrollmentSchema,
  );

  // Create a map of enrollment_id to enrollment for quick lookup
  const enrollmentMap = new Map(enrollments.map((e) => [e.id, e]));

  // Log audit events for each removed enrollment
  for (const deletedRow of deletedRows) {
    const enrollment = enrollmentMap.get(deletedRow.enrollment_id);
    await insertAuditEvent({
      tableName: 'student_label_enrollments',
      action: 'delete',
      actionDetail: 'enrollment_removed',
      rowId: deletedRow.id,
      oldRow: deletedRow,
      subjectUserId: enrollment?.user_id ?? null,
      courseInstanceId: label.course_instance_id,
      enrollmentId: deletedRow.enrollment_id,
      agentUserId: authzData.user.id,
      agentAuthnUserId: 'authn_user' in authzData ? authzData.authn_user.id : authzData.user.id,
      context: { label_name: label.name },
    });
  }

  return deletedRows.length;
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
