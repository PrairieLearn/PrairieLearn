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
} from './course-instance-publishing-extensions.types.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Finds all publishing extensions that apply to a specific enrollment.
 */
export async function selectPublishingExtensionsByEnrollmentId(
  enrollment_id: string,
): Promise<CourseInstancePublishingExtension[]> {
  return await queryRows(
    sql.select_publishing_extensions_by_enrollment_id,
    { enrollment_id },
    CourseInstancePublishingExtensionSchema,
  );
}

/**
 * Finds all publishing extensions for a course instance with user data.
 */
export async function selectPublishingExtensionsWithUsersByCourseInstance(
  course_instance_id: string,
): Promise<CourseInstancePublishingExtensionWithUsers[]> {
  return await queryRows(
    sql.select_publishing_extensions_with_uids_by_course_instance,
    { course_instance_id },
    CourseInstancePublishingExtensionWithUsersSchema,
  );
}

/**
 * Creates a new publishing extension for a course instance.
 */
export async function insertPublishingExtension({
  course_instance_id,
  name,
  unpublish_date,
}: {
  course_instance_id: string;
  name: string | null;
  unpublish_date: Date | null;
}): Promise<CourseInstancePublishingExtension> {
  return await queryRow(
    sql.insert_publishing_extension,
    {
      course_instance_id,
      name,
      unpublish_date,
    },
    CourseInstancePublishingExtensionSchema,
  );
}

/**
 * Links a publishing extension to a specific enrollment.
 */
export async function insertPublishingEnrollmentExtension({
  course_instance_publishing_extension_id,
  enrollment_id,
}: {
  course_instance_publishing_extension_id: string;
  enrollment_id: string;
}): Promise<CourseInstancePublishingEnrollmentExtension> {
  return await queryRow(
    sql.insert_publishing_enrollment_extension,
    {
      course_instance_publishing_extension_id,
      enrollment_id,
    },
    CourseInstancePublishingEnrollmentExtensionSchema,
  );
}

/**
 * Creates a publishing extension with enrollment links in a transaction.
 */
export async function createPublishingExtensionWithEnrollments({
  course_instance_id,
  name,
  unpublish_date,
  enrollment_ids,
}: {
  course_instance_id: string;
  name: string | null;
  unpublish_date: Date | null;
  enrollment_ids: string[];
}): Promise<CourseInstancePublishingExtension> {
  return await runInTransactionAsync(async () => {
    // Create the extension
    const extension = await insertPublishingExtension({
      course_instance_id,
      name,
      unpublish_date,
    });

    // Link to enrollments
    for (const enrollment_id of enrollment_ids) {
      await insertPublishingEnrollmentExtension({
        course_instance_publishing_extension_id: extension.id,
        enrollment_id,
      });
    }

    return extension;
  });
}

/**
 * Deletes a publishing extension.
 */
export async function deletePublishingExtension({
  extension_id,
  course_instance_id,
}: {
  extension_id: string;
  course_instance_id: string;
}): Promise<void> {
  await execute(sql.delete_publishing_extension, {
    extension_id,
    course_instance_id,
  });
}

/**
 * Updates a publishing extension.
 */
export async function updatePublishingExtension({
  extension_id,
  course_instance_id,
  name,
  unpublish_date,
}: {
  extension_id: string;
  course_instance_id: string;
  name: string | null;
  unpublish_date: Date | null;
}): Promise<CourseInstancePublishingExtension> {
  return await queryRow(
    sql.update_publishing_extension,
    {
      extension_id,
      course_instance_id,
      name,
      unpublish_date,
    },
    CourseInstancePublishingExtensionSchema,
  );
}
