import * as error from '@prairielearn/error';
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
  type CourseInstancePublishingExtension,
  type CourseInstancePublishingExtensionEnrollment,
  CourseInstancePublishingExtensionEnrollmentSchema,
  CourseInstancePublishingExtensionSchema,
  type Enrollment,
  EnrollmentSchema,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

function assertPublishingExtensionBelongsToCourseInstance(
  extension: CourseInstancePublishingExtension,
  courseInstance: CourseInstance,
) {
  if (extension.course_instance_id !== courseInstance.id) {
    throw new error.HttpStatusError(403, 'Access denied');
  }
}

function assertEnrollmentBelongsToPublishingExtensionCourseInstance(
  enrollment: Enrollment,
  extension: CourseInstancePublishingExtension,
) {
  if (enrollment.course_instance_id !== extension.course_instance_id) {
    throw new error.HttpStatusError(
      403,
      'Enrollment does not belong to the same course instance as the publishing extension',
    );
  }
}

export async function selectPublishingExtensionById({
  id,
  courseInstance,
}: {
  id: string;
  courseInstance: CourseInstance;
}) {
  const extension = await queryRow(
    sql.select_publishing_extension_by_id,
    { id },
    CourseInstancePublishingExtensionSchema,
  );
  assertPublishingExtensionBelongsToCourseInstance(extension, courseInstance);
  return extension;
}
/**
 * Finds the latest publishing extension that applies to a specific enrollment.
 */
export async function selectLatestPublishingExtensionByEnrollment({
  enrollment,
}: {
  enrollment: Enrollment;
}) {
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
  const extension = await queryOptionalRow(
    sql.select_publishing_extension_by_name,
    { name, course_instance_id: courseInstance.id },
    CourseInstancePublishingExtensionSchema,
  );
  if (extension) {
    assertPublishingExtensionBelongsToCourseInstance(extension, courseInstance);
  }
  return extension;
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
export async function addEnrollmentToPublishingExtension({
  courseInstancePublishingExtension,
  enrollment,
}: {
  courseInstancePublishingExtension: CourseInstancePublishingExtension;
  enrollment: Enrollment;
}): Promise<CourseInstancePublishingExtensionEnrollment> {
  assertEnrollmentBelongsToPublishingExtensionCourseInstance(
    enrollment,
    courseInstancePublishingExtension,
  );

  return await queryRow(
    sql.add_enrollment_to_publishing_extension,
    {
      course_instance_publishing_extension_id: courseInstancePublishingExtension.id,
      enrollment_id: enrollment.id,
    },
    CourseInstancePublishingExtensionEnrollmentSchema,
  );
}

/**
 * Removes a student from a publishing extension.
 */
export async function removeStudentFromPublishingExtension({
  courseInstancePublishingExtension,
  enrollment,
}: {
  courseInstancePublishingExtension: CourseInstancePublishingExtension;
  enrollment: Enrollment;
}): Promise<void> {
  assertEnrollmentBelongsToPublishingExtensionCourseInstance(
    enrollment,
    courseInstancePublishingExtension,
  );

  await execute(sql.remove_enrollment_from_publishing_extension, {
    extension_id: courseInstancePublishingExtension.id,
    enrollment_id: enrollment.id,
  });
}

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
      await addEnrollmentToPublishingExtension({
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
  assertPublishingExtensionBelongsToCourseInstance(extension, courseInstance);
  await execute(sql.delete_publishing_extension, {
    extension_id: extension.id,
  });
}

export async function selectEnrollmentsForPublishingExtension({
  extension,
}: {
  extension: CourseInstancePublishingExtension;
}) {
  return await queryRows(
    sql.select_enrollments_for_publishing_extension,
    {
      extension_id: extension.id,
    },
    EnrollmentSchema,
  );
}
/**
 * Updates a publishing extension.
 */
export async function updatePublishingExtension({
  extension,
  name,
  endDate,
}: {
  extension: CourseInstancePublishingExtension;
  name: string | null;
  endDate: Date | null;
}): Promise<CourseInstancePublishingExtension> {
  const updatedExtension = await queryRow(
    sql.update_publishing_extension,
    {
      extension_id: extension.id,
      name,
      end_date: endDate,
    },
    CourseInstancePublishingExtensionSchema,
  );
  return updatedExtension;
}
