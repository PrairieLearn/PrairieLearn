import { HttpStatusError } from '@prairielearn/error';
import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';

import {
  type Enrollment,
  EnrollmentSchema,
  type StudentGroup,
  type StudentGroupEnrollment,
  StudentGroupEnrollmentSchema,
  StudentGroupSchema,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Creates a new student group in the given course instance.
 */
export async function createStudentGroup({
  course_instance_id,
  name,
}: {
  course_instance_id: string;
  name: string;
}): Promise<StudentGroup> {
  return await queryRow(sql.create_student_group, { course_instance_id, name }, StudentGroupSchema);
}

/**
 * Selects all student groups for a given course instance.
 */
export async function selectStudentGroupsByCourseInstance(
  course_instance_id: string,
): Promise<StudentGroup[]> {
  return await queryRows(
    sql.select_student_groups_by_course_instance,
    { course_instance_id },
    StudentGroupSchema,
  );
}

/**
 * Selects a student group by its ID.
 */
export async function selectStudentGroupById(id: string): Promise<StudentGroup> {
  return await queryRow(sql.select_student_group_by_id, { id }, StudentGroupSchema);
}

/**
 * Renames a student group.
 */
export async function renameStudentGroup({
  id,
  name,
}: {
  id: string;
  name: string;
}): Promise<StudentGroup> {
  return await queryRow(sql.update_student_group_name, { id, name }, StudentGroupSchema);
}

/**
 * Soft deletes a student group by setting its deleted_at timestamp.
 */
export async function deleteStudentGroup(id: string): Promise<StudentGroup> {
  return await queryRow(sql.delete_student_group, { id }, StudentGroupSchema);
}

/**
 * Adds an enrollment to a student group. If the enrollment is already in the group,
 * this is a no-op.
 */
export async function addEnrollmentToStudentGroup({
  enrollment_id,
  student_group_id,
}: {
  enrollment_id: string;
  student_group_id: string;
}): Promise<StudentGroupEnrollment | null> {
  return await queryOptionalRow(
    sql.add_enrollment_to_student_group,
    { enrollment_id, student_group_id },
    StudentGroupEnrollmentSchema,
  );
}

/**
 * Removes an enrollment from a student group.
 */
export async function removeEnrollmentFromStudentGroup({
  enrollment_id,
  student_group_id,
}: {
  enrollment_id: string;
  student_group_id: string;
}): Promise<void> {
  await execute(sql.remove_enrollment_from_student_group, { enrollment_id, student_group_id });
}

/**
 * Selects all enrollments in a given student group.
 */
export async function selectEnrollmentsInStudentGroup(
  student_group_id: string,
): Promise<Enrollment[]> {
  return await queryRows(
    sql.select_enrollments_in_student_group,
    { student_group_id },
    EnrollmentSchema,
  );
}

/**
 * Selects all student groups that an enrollment belongs to.
 */
export async function selectStudentGroupsForEnrollment(
  enrollment_id: string,
): Promise<StudentGroup[]> {
  return await queryRows(
    sql.select_student_groups_for_enrollment,
    { enrollment_id },
    StudentGroupSchema,
  );
}

/**
 * Verifies that a student group belongs to the given course instance.
 * Throws HttpStatusError(403) if the group doesn't belong to the course instance.
 * Returns the group if valid.
 */
export async function verifyGroupBelongsToCourseInstance(
  group_id: string,
  course_instance_id: string,
): Promise<StudentGroup> {
  const group = await selectStudentGroupById(group_id);
  if (group.course_instance_id !== course_instance_id) {
    throw new HttpStatusError(403, 'Group does not belong to this course instance');
  }
  return group;
}

/**
 * Creates a student group with error handling for duplicate names.
 * Throws a user-friendly error if a group with the same name already exists.
 */
export async function createStudentGroupWithErrorHandling({
  course_instance_id,
  name,
}: {
  course_instance_id: string;
  name: string;
}): Promise<StudentGroup> {
  try {
    return await createStudentGroup({ course_instance_id, name });
  } catch (err: any) {
    if (err.constraint === 'student_groups_course_instance_id_name_key') {
      throw new HttpStatusError(400, 'A group with this name already exists');
    }
    throw err;
  }
}

/**
 * Creates a new student group and adds the specified enrollments to it.
 * Returns the created group.
 */
export async function createStudentGroupAndAddEnrollments({
  course_instance_id,
  name,
  enrollment_ids,
}: {
  course_instance_id: string;
  name: string;
  enrollment_ids: string[];
}): Promise<StudentGroup> {
  const group = await createStudentGroupWithErrorHandling({
    course_instance_id,
    name,
  });

  // Add all enrollments to the group
  for (const enrollmentId of enrollment_ids) {
    await addEnrollmentToStudentGroup({
      enrollment_id: enrollmentId,
      student_group_id: group.id,
    });
  }

  return group;
}
