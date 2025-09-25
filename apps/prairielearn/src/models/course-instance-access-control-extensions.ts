import {
  execute,
  loadSqlEquiv,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  type CourseInstanceAccessControlEnrollmentOverride,
  CourseInstanceAccessControlEnrollmentOverrideSchema,
  type CourseInstanceAccessControlExtension,
  CourseInstanceAccessControlExtensionSchema,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Finds all access control extensions that apply to a specific enrollment.
 */
export async function selectAccessControlExtensionsByEnrollmentId(
  enrollment_id: string,
): Promise<CourseInstanceAccessControlExtension[]> {
  return await queryRows(
    sql.select_access_control_extensions_by_enrollment_id,
    { enrollment_id },
    CourseInstanceAccessControlExtensionSchema,
  );
}

/**
 * Finds all access control extensions for a course instance.
 */
export async function selectAccessControlExtensionsByCourseInstance(
  course_instance_id: string,
): Promise<CourseInstanceAccessControlExtension[]> {
  return await queryRows(
    sql.select_access_control_extensions_by_course_instance,
    { course_instance_id },
    CourseInstanceAccessControlExtensionSchema,
  );
}

/**
 * Creates a new access control extension for a course instance.
 */
export async function insertAccessControlExtension({
  course_instance_id,
  enabled,
  name,
  published_end_date,
}: {
  course_instance_id: string;
  enabled: boolean;
  name: string | null;
  published_end_date: Date | null;
}): Promise<CourseInstanceAccessControlExtension> {
  return await queryRow(
    sql.insert_access_control_extension,
    {
      course_instance_id,
      enabled,
      name,
      published_end_date,
    },
    CourseInstanceAccessControlExtensionSchema,
  );
}

/**
 * Links an access control extension to a specific enrollment.
 */
export async function insertAccessControlEnrollmentOverride({
  course_instance_access_control_extension_id,
  enrollment_id,
}: {
  course_instance_access_control_extension_id: string;
  enrollment_id: string;
}): Promise<CourseInstanceAccessControlEnrollmentOverride> {
  return await queryRow(
    sql.insert_access_control_enrollment_override,
    {
      course_instance_access_control_extension_id,
      enrollment_id,
    },
    CourseInstanceAccessControlEnrollmentOverrideSchema,
  );
}

/**
 * Creates an access control extension with enrollment links in a transaction.
 */
export async function createAccessControlExtensionWithEnrollments({
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
}): Promise<CourseInstanceAccessControlExtension> {
  return await runInTransactionAsync(async () => {
    // Create the extension
    const extension = await insertAccessControlExtension({
      course_instance_id,
      enabled,
      name,
      published_end_date,
    });

    // Link to enrollments
    for (const enrollment_id of enrollment_ids) {
      await insertAccessControlEnrollmentOverride({
        course_instance_access_control_extension_id: extension.id,
        enrollment_id,
      });
    }

    return extension;
  });
}

/**
 * Deletes an access control extension.
 */
export async function deleteAccessControlExtension({
  extension_id,
  course_instance_id,
}: {
  extension_id: string;
  course_instance_id: string;
}): Promise<void> {
  await execute(sql.delete_access_control_extension, {
    extension_id,
    course_instance_id,
  });
}

/**
 * Updates an access control extension.
 */
export async function updateAccessControlExtension({
  extension_id,
  course_instance_id,
  enabled,
  name,
  published_end_date,
}: {
  extension_id: string;
  course_instance_id: string;
  enabled: boolean;
  name: string | null;
  published_end_date: Date | null;
}): Promise<CourseInstanceAccessControlExtension> {
  return await queryRow(
    sql.update_access_control_extension,
    {
      extension_id,
      course_instance_id,
      enabled,
      name,
      published_end_date,
    },
    CourseInstanceAccessControlExtensionSchema,
  );
}
