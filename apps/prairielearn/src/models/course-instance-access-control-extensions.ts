import {
  execute,
  loadSqlEquiv,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  type CourseInstancePublishingEnrollmentExtension,
  CourseInstancePublishingEnrollmentExtensionSchema,
  type CourseInstancePublishingExtension,
  CourseInstancePublishingExtensionSchema,
} from '../lib/db-types.js';

import {
  type CourseInstancePublishingExtensionWithUsers,
  CourseInstancePublishingExtensionWithUsersSchema,
} from './course-instance-access-control-extensions.types.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Finds all access control extensions that apply to a specific enrollment.
 */
export async function selectAccessControlExtensionsByEnrollmentId(
  enrollment_id: string,
): Promise<CourseInstancePublishingExtension[]> {
  return await queryRows(
    sql.select_access_control_extensions_by_enrollment_id,
    { enrollment_id },
    CourseInstancePublishingExtensionSchema,
  );
}

/**
 * Finds all access control extensions for a course instance.
 */
export async function selectAccessControlExtensionsByCourseInstance(
  course_instance_id: string,
): Promise<CourseInstancePublishingExtension[]> {
  return await queryRows(
    sql.select_access_control_extensions_by_course_instance,
    { course_instance_id },
    CourseInstancePublishingExtensionSchema,
  );
}

/**
 * Finds all access control extensions for a course instance with user data.
 */
export async function selectAccessControlExtensionsWithUsersByCourseInstance(
  course_instance_id: string,
): Promise<CourseInstancePublishingExtensionWithUsers[]> {
  return await queryRows(
    sql.select_access_control_extensions_with_uids_by_course_instance,
    { course_instance_id },
    CourseInstancePublishingExtensionWithUsersSchema,
  );
}

/**
 * Creates a new access control extension for a course instance.
 */
export async function insertAccessControlExtension({
  course_instance_id,
  enabled,
  name,
  archive_date,
}: {
  course_instance_id: string;
  enabled: boolean;
  name: string | null;
  archive_date: Date | null;
}): Promise<CourseInstancePublishingExtension> {
  return await queryRow(
    sql.insert_access_control_extension,
    {
      course_instance_id,
      enabled,
      name,
      archive_date,
    },
    CourseInstancePublishingExtensionSchema,
  );
}

/**
 * Links an access control extension to a specific enrollment.
 */
export async function insertAccessControlEnrollmentExtension({
  course_instance_access_control_extension_id,
  enrollment_id,
}: {
  course_instance_access_control_extension_id: string;
  enrollment_id: string;
}): Promise<CourseInstancePublishingEnrollmentExtension> {
  return await queryRow(
    sql.insert_access_control_enrollment_extension,
    {
      course_instance_access_control_extension_id,
      enrollment_id,
    },
    CourseInstancePublishingEnrollmentExtensionSchema,
  );
}

/**
 * Creates an access control extension with enrollment links in a transaction.
 */
export async function createAccessControlExtensionWithEnrollments({
  course_instance_id,
  enabled,
  name,
  archive_date,
  enrollment_ids,
}: {
  course_instance_id: string;
  enabled: boolean;
  name: string | null;
  archive_date: Date | null;
  enrollment_ids: string[];
}): Promise<CourseInstancePublishingExtension> {
  return await runInTransactionAsync(async () => {
    // Create the extension
    const extension = await insertAccessControlExtension({
      course_instance_id,
      enabled,
      name,
      archive_date,
    });

    // Link to enrollments
    for (const enrollment_id of enrollment_ids) {
      await insertAccessControlEnrollmentExtension({
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
  archive_date,
}: {
  extension_id: string;
  course_instance_id: string;
  enabled: boolean;
  name: string | null;
  archive_date: Date | null;
}): Promise<CourseInstancePublishingExtension> {
  return await queryRow(
    sql.update_access_control_extension,
    {
      extension_id,
      course_instance_id,
      enabled,
      name,
      archive_date,
    },
    CourseInstancePublishingExtensionSchema,
  );
}
