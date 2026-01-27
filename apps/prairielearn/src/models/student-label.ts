import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';

import {
  type CourseInstance,
  type Enrollment,
  EnrollmentSchema,
  type StudentLabel,
  type StudentLabelEnrollment,
  StudentLabelEnrollmentSchema,
  StudentLabelSchema,
} from '../lib/db-types.js';

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
  const label = await queryRow(sql.select_student_label_by_id, { id }, StudentLabelSchema);
  if (label.course_instance_id !== courseInstance.id) {
    throw new HttpStatusError(403, 'Label does not belong to this course instance');
  }
  return label;
}

/**
 * Soft deletes a student label by setting its deleted_at timestamp.
 *
 * This should ONLY be called for testing.
 */
export async function deleteStudentLabel(id: string): Promise<StudentLabel> {
  return await queryRow(sql.delete_student_label, { id }, StudentLabelSchema);
}

/**
 * Adds an enrollment to a student label. If the enrollment is already in the label,
 * this is a no-op.
 *
 * Callers must ensure that the enrollment belongs to the same course instance as the label.
 */
export async function addEnrollmentToStudentLabel({
  enrollment,
  label,
}: {
  enrollment: Enrollment;
  label: StudentLabel;
}): Promise<StudentLabelEnrollment | null> {
  return await queryOptionalRow(
    sql.add_enrollment_to_student_label,
    { enrollment_id: enrollment.id, student_label_id: label.id },
    StudentLabelEnrollmentSchema,
  );
}

/**
 * Removes an enrollment from a student label.
 *
 * Callers must ensure that the enrollment belongs to the same course instance as the label.
 */
export async function removeEnrollmentFromStudentLabel({
  enrollment,
  label,
}: {
  enrollment: Enrollment;
  label: StudentLabel;
}): Promise<void> {
  await execute(sql.remove_enrollment_from_student_label, {
    enrollment_id: enrollment.id,
    student_label_id: label.id,
  });
}

/**
 * Adds multiple enrollments to a student label in a single operation.
 * Returns the newly added enrollments (those not already in the label).
 *
 * Callers must ensure that all enrollments belong to the same course instance as the label.
 */
export async function addEnrollmentsToStudentLabel({
  enrollments,
  label,
}: {
  enrollments: Enrollment[];
  label: StudentLabel;
}): Promise<StudentLabelEnrollment[]> {
  if (enrollments.length === 0) {
    return [];
  }
  return await queryRows(
    sql.add_enrollments_to_student_label,
    { enrollment_ids: enrollments.map((e) => e.id), student_label_id: label.id },
    StudentLabelEnrollmentSchema,
  );
}

/**
 * Removes multiple enrollments from a student label in a single operation.
 * Returns the count of enrollments actually removed.
 *
 * Callers must ensure that all enrollments belong to the same course instance as the label.
 */
export async function removeEnrollmentsFromStudentLabel({
  enrollments,
  label,
}: {
  enrollments: Enrollment[];
  label: StudentLabel;
}): Promise<number> {
  if (enrollments.length === 0) {
    return 0;
  }
  return await queryRow(
    sql.remove_enrollments_from_student_label_with_count,
    { enrollment_ids: enrollments.map((e) => e.id), student_label_id: label.id },
    z.number(),
  );
}

/**
 * Selects all enrollments in a given student label.
 */
export async function selectEnrollmentsInStudentLabel(label: StudentLabel): Promise<Enrollment[]> {
  return await queryRows(
    sql.select_enrollments_in_student_label,
    { student_label_id: label.id },
    EnrollmentSchema,
  );
}

/**
 * Selects all student labels that an enrollment belongs to.
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
