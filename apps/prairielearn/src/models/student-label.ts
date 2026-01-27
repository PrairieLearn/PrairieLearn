import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
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
  course_instance_id,
  name,
  color = 'gray1',
}: {
  course_instance_id: string;
  name: string;
  color?: string;
}): Promise<StudentLabel> {
  return await queryRow(
    sql.create_student_label,
    { course_instance_id, name, color },
    StudentLabelSchema,
  );
}

/**
 * Selects all student labels for a given course instance.
 */
export async function selectStudentLabelsByCourseInstance(
  course_instance_id: string,
): Promise<StudentLabel[]> {
  return await queryRows(
    sql.select_student_labels_by_course_instance,
    { course_instance_id },
    StudentLabelSchema,
  );
}

/**
 * Selects a student label by its ID.
 */
export async function selectStudentLabelById(id: string): Promise<StudentLabel> {
  return await queryRow(sql.select_student_label_by_id, { id }, StudentLabelSchema);
}

/**
 * Updates a student label's name and color.
 */
export async function updateStudentLabel({
  id,
  name,
  color,
}: {
  id: string;
  name: string;
  color: string;
}): Promise<StudentLabel> {
  return await queryRow(sql.update_student_label, { id, name, color }, StudentLabelSchema);
}

/**
 * Soft deletes a student label by setting its deleted_at timestamp.
 */
export async function deleteStudentLabel(id: string): Promise<StudentLabel> {
  return await queryRow(sql.delete_student_label, { id }, StudentLabelSchema);
}

/**
 * Adds an enrollment to a student label. If the enrollment is already in the label,
 * this is a no-op.
 */
export async function addEnrollmentToStudentLabel({
  enrollment_id,
  student_label_id,
}: {
  enrollment_id: string;
  student_label_id: string;
}): Promise<StudentLabelEnrollment | null> {
  return await queryOptionalRow(
    sql.add_enrollment_to_student_label,
    { enrollment_id, student_label_id },
    StudentLabelEnrollmentSchema,
  );
}

/**
 * Removes an enrollment from a student label.
 */
export async function removeEnrollmentFromStudentLabel({
  enrollment_id,
  student_label_id,
}: {
  enrollment_id: string;
  student_label_id: string;
}): Promise<void> {
  await execute(sql.remove_enrollment_from_student_label, { enrollment_id, student_label_id });
}

/**
 * Adds multiple enrollments to a student label in a single operation.
 * Only adds enrollments that are in the same course instance as the label.
 * Returns the newly added enrollments (those not already in the label).
 */
export async function batchAddEnrollmentsToStudentLabel({
  enrollment_ids,
  student_label_id,
}: {
  enrollment_ids: string[];
  student_label_id: string;
}): Promise<StudentLabelEnrollment[]> {
  if (enrollment_ids.length === 0) {
    return [];
  }
  return await queryRows(
    sql.batch_add_enrollments_to_student_label,
    { enrollment_ids, student_label_id },
    StudentLabelEnrollmentSchema,
  );
}

/**
 * Removes multiple enrollments from a student label in a single operation.
 * Returns the count of enrollments actually removed.
 */
export async function batchRemoveEnrollmentsFromStudentLabel({
  enrollment_ids,
  student_label_id,
}: {
  enrollment_ids: string[];
  student_label_id: string;
}): Promise<number> {
  if (enrollment_ids.length === 0) {
    return 0;
  }
  return await queryRow(
    sql.batch_remove_enrollments_from_student_label_with_count,
    { enrollment_ids, student_label_id },
    z.number(),
  );
}

/**
 * Selects all enrollments in a given student label.
 */
export async function selectEnrollmentsInStudentLabel(
  student_label_id: string,
): Promise<Enrollment[]> {
  return await queryRows(
    sql.select_enrollments_in_student_label,
    { student_label_id },
    EnrollmentSchema,
  );
}

/**
 * Selects the IDs of all enrollments in a given student label.
 */
export async function selectEnrollmentIdsForStudentLabel(
  student_label_id: string,
): Promise<string[]> {
  return await queryRows(
    sql.select_enrollment_ids_for_student_label,
    { student_label_id },
    IdSchema,
  );
}

/**
 * Selects all student labels that an enrollment belongs to.
 */
export async function selectStudentLabelsForEnrollment(
  enrollment_id: string,
): Promise<StudentLabel[]> {
  return await queryRows(
    sql.select_student_labels_for_enrollment,
    { enrollment_id },
    StudentLabelSchema,
  );
}

/**
 * Verifies that a student label belongs to the given course instance.
 * Throws HttpStatusError(403) if the label doesn't belong to the course instance.
 * Returns the label if valid.
 */
export async function verifyLabelBelongsToCourseInstance(
  label_id: string,
  course_instance_id: string,
): Promise<StudentLabel> {
  const label = await selectStudentLabelById(label_id);
  if (label.course_instance_id !== course_instance_id) {
    throw new HttpStatusError(403, 'Label does not belong to this course instance');
  }
  return label;
}
