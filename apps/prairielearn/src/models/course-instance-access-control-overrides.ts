import {
  execute,
  loadSqlEquiv,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  type CourseInstanceAccessControlEnrollmentOverride,
  type CourseInstanceAccessControlOverride,
  CourseInstanceAccessControlEnrollmentOverrideSchema,
  CourseInstanceAccessControlOverrideSchema,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Finds all access control overrides that apply to a specific enrollment.
 */
export async function selectAccessControlOverridesByEnrollmentId(
  enrollment_id: string,
): Promise<CourseInstanceAccessControlOverride[]> {
  return await queryRows(
    sql.select_access_control_overrides_by_enrollment_id,
    { enrollment_id },
    CourseInstanceAccessControlOverrideSchema,
  );
}

/**
 * Finds all access control overrides for a course instance.
 */
export async function selectAccessControlOverridesByCourseInstance(
  course_instance_id: string,
): Promise<CourseInstanceAccessControlOverride[]> {
  return await queryRows(
    sql.select_access_control_overrides_by_course_instance,
    { course_instance_id },
    CourseInstanceAccessControlOverrideSchema,
  );
}

/**
 * Creates a new access control override for a course instance.
 */
export async function insertAccessControlOverride({
  course_instance_id,
  enabled,
  name,
  published_end_date,
}: {
  course_instance_id: string;
  enabled: boolean;
  name: string | null;
  published_end_date: Date | null;
}): Promise<CourseInstanceAccessControlOverride> {
  return await queryRow(
    sql.insert_access_control_override,
    {
      course_instance_id,
      enabled,
      name,
      published_end_date,
    },
    CourseInstanceAccessControlOverrideSchema,
  );
}

/**
 * Links an access control override to a specific enrollment.
 */
export async function insertAccessControlEnrollmentOverride({
  course_instance_access_control_override_id,
  enrollment_id,
}: {
  course_instance_access_control_override_id: string;
  enrollment_id: string;
}): Promise<CourseInstanceAccessControlEnrollmentOverride> {
  return await queryRow(
    sql.insert_access_control_enrollment_override,
    {
      course_instance_access_control_override_id,
      enrollment_id,
    },
    CourseInstanceAccessControlEnrollmentOverrideSchema,
  );
}

/**
 * Creates an access control override with enrollment links in a transaction.
 */
export async function createAccessControlOverrideWithEnrollments({
  course_instance_id,
  enabled,
  name,
  published_end_date,
  enrollment_ids,
}: {
  course_instance_id: string;
  enabled: boolean;
  name: string | null;
  published_end_date: Date | null;
  enrollment_ids: string[];
}): Promise<CourseInstanceAccessControlOverride> {
  return await runInTransactionAsync(async () => {
    // Create the override
    const override = await insertAccessControlOverride({
      course_instance_id,
      enabled,
      name,
      published_end_date,
    });

    // Link to enrollments
    for (const enrollment_id of enrollment_ids) {
      await insertAccessControlEnrollmentOverride({
        course_instance_access_control_override_id: override.id,
        enrollment_id,
      });
    }

    return override;
  });
}

/**
 * Deletes an access control override.
 */
export async function deleteAccessControlOverride({
  override_id,
  course_instance_id,
}: {
  override_id: string;
  course_instance_id: string;
}): Promise<void> {
  await execute(sql.delete_access_control_override, {
    override_id,
    course_instance_id,
  });
}

/**
 * Updates an access control override.
 */
export async function updateAccessControlOverride({
  override_id,
  course_instance_id,
  enabled,
  name,
  published_end_date,
}: {
  override_id: string;
  course_instance_id: string;
  enabled: boolean;
  name: string | null;
  published_end_date: Date | null;
}): Promise<CourseInstanceAccessControlOverride> {
  return await queryRow(
    sql.update_access_control_override,
    {
      override_id,
      course_instance_id,
      enabled,
      name,
      published_end_date,
    },
    CourseInstanceAccessControlOverrideSchema,
  );
}
