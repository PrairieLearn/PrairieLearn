import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';

import {
  type Enrollment,
  type EnrollmentInstanceGroup,
  EnrollmentInstanceGroupSchema,
  EnrollmentSchema,
  type InstanceGroup,
  InstanceGroupSchema,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Creates a new instance group in the given course instance.
 */
export async function createInstanceGroup({
  course_instance_id,
  name,
}: {
  course_instance_id: string;
  name: string;
}): Promise<InstanceGroup> {
  return await queryRow(
    sql.create_instance_group,
    { course_instance_id, name },
    InstanceGroupSchema,
  );
}

/**
 * Selects all instance groups for a given course instance.
 */
export async function selectInstanceGroupsByCourseInstance(
  course_instance_id: string,
): Promise<InstanceGroup[]> {
  return await queryRows(
    sql.select_instance_groups_by_course_instance,
    { course_instance_id },
    InstanceGroupSchema,
  );
}

/**
 * Selects an instance group by its ID.
 */
export async function selectInstanceGroupById(id: string): Promise<InstanceGroup> {
  return await queryRow(sql.select_instance_group_by_id, { id }, InstanceGroupSchema);
}

/**
 * Renames an instance group.
 */
export async function renameInstanceGroup({
  id,
  name,
}: {
  id: string;
  name: string;
}): Promise<InstanceGroup> {
  return await queryRow(sql.update_instance_group_name, { id, name }, InstanceGroupSchema);
}

/**
 * Soft deletes an instance group by setting its deleted_at timestamp.
 */
export async function deleteInstanceGroup(id: string): Promise<InstanceGroup> {
  return await queryRow(sql.delete_instance_group, { id }, InstanceGroupSchema);
}

/**
 * Adds an enrollment to an instance group. If the enrollment is already in the group,
 * this is a no-op.
 */
export async function addEnrollmentToInstanceGroup({
  enrollment_id,
  instance_group_id,
}: {
  enrollment_id: string;
  instance_group_id: string;
}): Promise<EnrollmentInstanceGroup | null> {
  return await queryOptionalRow(
    sql.add_enrollment_to_instance_group,
    { enrollment_id, instance_group_id },
    EnrollmentInstanceGroupSchema,
  );
}

/**
 * Removes an enrollment from an instance group.
 */
export async function removeEnrollmentFromInstanceGroup({
  enrollment_id,
  instance_group_id,
}: {
  enrollment_id: string;
  instance_group_id: string;
}): Promise<void> {
  await execute(sql.remove_enrollment_from_instance_group, { enrollment_id, instance_group_id });
}

/**
 * Selects all enrollments in a given instance group.
 */
export async function selectEnrollmentsInInstanceGroup(
  instance_group_id: string,
): Promise<Enrollment[]> {
  return await queryRows(
    sql.select_enrollments_in_instance_group,
    { instance_group_id },
    EnrollmentSchema,
  );
}

/**
 * Selects all instance groups that an enrollment belongs to.
 */
export async function selectInstanceGroupsForEnrollment(
  enrollment_id: string,
): Promise<InstanceGroup[]> {
  return await queryRows(
    sql.select_instance_groups_for_enrollment,
    { enrollment_id },
    InstanceGroupSchema,
  );
}
