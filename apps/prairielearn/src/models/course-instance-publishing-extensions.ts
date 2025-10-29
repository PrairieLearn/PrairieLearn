import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  type CourseInstance,
  type CourseInstancePublishingEnrollmentExtension,
  CourseInstancePublishingEnrollmentExtensionSchema,
  type CourseInstancePublishingExtension,
  CourseInstancePublishingExtensionSchema,
  type Enrollment,
} from '../lib/db-types.js';

import {
  type CourseInstancePublishingExtensionWithUsers,
  CourseInstancePublishingExtensionWithUsersSchema,
} from './course-instance-publishing-extensions.types.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Finds all publishing extensions that apply to a specific enrollment.
 */
export async function selectLatestPublishingExtensionByEnrollment(
  enrollment: Enrollment,
): Promise<CourseInstancePublishingExtension | null> {
  return await queryOptionalRow(
    sql.select_latest_publishing_extension_by_enrollment_id,
    { enrollment_id: enrollment.id },
    CourseInstancePublishingExtensionSchema,
  );
}

/**
 * Finds a publishing extension by name within a course instance.
 */
export async function selectPublishingExtensionByName({
  name,
  courseInstance,
}: {
  name: string;
  courseInstance: CourseInstance;
}): Promise<CourseInstancePublishingExtension | null> {
  return await queryOptionalRow(
    sql.select_publishing_extension_by_name,
    { name, course_instance_id: courseInstance.id },
    CourseInstancePublishingExtensionSchema,
  );
}

/**
 * Finds all publishing extensions for a course instance with user data.
 *
 * Only returns extensions for joined users.
 */
export async function selectPublishingExtensionsWithUsersByCourseInstance(
  courseInstance: CourseInstance,
): Promise<CourseInstancePublishingExtensionWithUsers[]> {
  return await queryRows(
    sql.select_publishing_extensions_with_uids_by_course_instance,
    { course_instance_id: courseInstance.id },
    CourseInstancePublishingExtensionWithUsersSchema,
  );
}

/**
 * Creates a new publishing extension for a course instance.
 */
export async function insertPublishingExtension({
  courseInstance,
  name,
  endDate,
}: {
  courseInstance: CourseInstance;
  name: string | null;
  endDate: Date | null;
}): Promise<CourseInstancePublishingExtension> {
  return await queryRow(
    sql.insert_publishing_extension,
    {
      course_instance_id: courseInstance.id,
      name,
      end_date: endDate,
    },
    CourseInstancePublishingExtensionSchema,
  );
}

/**
 * Links a publishing extension to a specific enrollment.
 */
export async function insertPublishingEnrollmentExtension({
  courseInstancePublishingExtension,
  enrollment,
}: {
  courseInstancePublishingExtension: CourseInstancePublishingExtension;
  enrollment: Enrollment;
}): Promise<CourseInstancePublishingEnrollmentExtension> {
  return await queryRow(
    sql.insert_publishing_enrollment_extension,
    {
      course_instance_publishing_extension_id: courseInstancePublishingExtension.id,
      enrollment_id: enrollment.id,
    },
    CourseInstancePublishingEnrollmentExtensionSchema,
  );
}

/**
 * Creates a publishing extension with enrollment links in a transaction.
 */
export async function createPublishingExtensionWithEnrollments({
  courseInstance,
  name,
  endDate,
  enrollments,
}: {
  courseInstance: CourseInstance;
  name: string | null;
  endDate: Date | null;
  enrollments: Enrollment[];
}): Promise<CourseInstancePublishingExtension> {
  return await runInTransactionAsync(async () => {
    const extension = await insertPublishingExtension({
      courseInstance,
      name,
      endDate,
    });

    for (const enrollment of enrollments) {
      await insertPublishingEnrollmentExtension({
        courseInstancePublishingExtension: extension,
        enrollment,
      });
    }

    return extension;
  });
}

/**
 * Deletes a publishing extension.
 */
export async function deletePublishingExtension({
  extension,
  courseInstance,
}: {
  extension: CourseInstancePublishingExtension;
  courseInstance: CourseInstance;
}): Promise<void> {
  await execute(sql.delete_publishing_extension, {
    extension_id: extension.id,
    course_instance_id: courseInstance.id,
  });
}

/**
 * Updates a publishing extension.
 */
export async function updatePublishingExtension({
  extension,
  courseInstance,
  name,
  endDate,
}: {
  extension: CourseInstancePublishingExtension;
  courseInstance: CourseInstance;
  name: string | null;
  endDate: Date | null;
}): Promise<CourseInstancePublishingExtension> {
  return await queryRow(
    sql.update_publishing_extension,
    {
      extension_id: extension.id,
      course_instance_id: courseInstance.id,
      name,
      end_date: endDate,
    },
    CourseInstancePublishingExtensionSchema,
  );
}
