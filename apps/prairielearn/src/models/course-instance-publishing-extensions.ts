import * as error from '@prairielearn/error';
import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { type AuthzData, assertHasRole } from '../lib/authz-data-lib.js';
import {
  type CourseInstance,
  type CourseInstancePublishingExtension,
  type CourseInstancePublishingExtensionEnrollment,
  CourseInstancePublishingExtensionEnrollmentSchema,
  CourseInstancePublishingExtensionSchema,
  type Enrollment,
} from '../lib/db-types.js';

import {
  type CourseInstancePublishingExtensionWithUsers,
  CourseInstancePublishingExtensionWithUsersSchema,
} from './course-instance-publishing-extensions.types.js';

const sql = loadSqlEquiv(import.meta.url);

function assertPublishingExtensionBelongsToCourseInstance(
  extension: CourseInstancePublishingExtension,
  courseInstance: CourseInstance,
) {
  if (extension.course_instance_id !== courseInstance.id) {
    throw new error.HttpStatusError(403, 'Access denied');
  }
}

export async function selectPublishingExtensionById({
  id,
  courseInstance,
  authzData,
  requestedRole,
}: {
  id: string;
  courseInstance: CourseInstance;
  authzData: AuthzData;
  requestedRole: 'System' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
}) {
  assertHasRole(authzData, requestedRole);
  const extension = await queryRow(
    sql.select_publishing_extension_by_id,
    { id },
    CourseInstancePublishingExtensionSchema,
  );
  assertPublishingExtensionBelongsToCourseInstance(extension, courseInstance);
  return extension;
}
/**
 * Finds all publishing extensions that apply to a specific enrollment.
 */
export async function selectLatestPublishingExtensionByEnrollment({
  enrollment,
  authzData,
  requestedRole,
}: {
  enrollment: Enrollment;
  authzData: AuthzData;
  requestedRole: 'System' | 'Student' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
}) {
  assertHasRole(authzData, requestedRole);
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
  authzData,
  requestedRole,
}: {
  name: string;
  courseInstance: CourseInstance;
  authzData: AuthzData;
  requestedRole: 'System' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
}): Promise<CourseInstancePublishingExtension | null> {
  assertHasRole(authzData, requestedRole);
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
 * Finds all publishing extensions for a course instance with user data.
 *
 * Only returns extensions for joined users.
 */
export async function selectPublishingExtensionsWithUsersByCourseInstance({
  courseInstance,
  authzData,
  requestedRole,
}: {
  courseInstance: CourseInstance;
  authzData: AuthzData;
  requestedRole: 'System' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
}): Promise<CourseInstancePublishingExtensionWithUsers[]> {
  assertHasRole(authzData, requestedRole);
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
  authzData,
  requestedRole,
}: {
  courseInstance: CourseInstance;
  name: string | null;
  endDate: Date | null;
  authzData: AuthzData;
  requestedRole: 'System' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
}): Promise<CourseInstancePublishingExtension> {
  assertHasRole(authzData, requestedRole);
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
  authzData,
  requestedRole,
}: {
  courseInstancePublishingExtension: CourseInstancePublishingExtension;
  enrollment: Enrollment;
  authzData: AuthzData;
  requestedRole: 'System' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
}): Promise<CourseInstancePublishingExtensionEnrollment> {
  assertHasRole(authzData, requestedRole);
  return await queryRow(
    sql.insert_publishing_enrollment_extension,
    {
      course_instance_publishing_extension_id: courseInstancePublishingExtension.id,
      enrollment_id: enrollment.id,
    },
    CourseInstancePublishingExtensionEnrollmentSchema,
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
  authzData,
  requestedRole,
}: {
  courseInstance: CourseInstance;
  name: string | null;
  endDate: Date | null;
  enrollments: Enrollment[];
  authzData: AuthzData;
  requestedRole: 'System' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
}): Promise<CourseInstancePublishingExtension> {
  assertHasRole(authzData, requestedRole);
  return await runInTransactionAsync(async () => {
    const extension = await insertPublishingExtension({
      courseInstance,
      name,
      endDate,
      authzData,
      requestedRole,
    });

    for (const enrollment of enrollments) {
      await insertPublishingEnrollmentExtension({
        courseInstancePublishingExtension: extension,
        enrollment,
        authzData,
        requestedRole,
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
  authzData,
  requestedRole,
}: {
  extension: CourseInstancePublishingExtension;
  courseInstance: CourseInstance;
  authzData: AuthzData;
  requestedRole: 'System' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
}): Promise<void> {
  assertHasRole(authzData, requestedRole);
  await execute(sql.delete_publishing_extension, {
    extension_id: extension.id,
  });
}

/**
 * Updates a publishing extension.
 */
export async function updatePublishingExtension({
  extension,
  name,
  endDate,
  authzData,
  requestedRole,
}: {
  extension: CourseInstancePublishingExtension;
  name: string | null;
  endDate: Date | null;
  authzData: AuthzData;
  requestedRole: 'System' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
}): Promise<CourseInstancePublishingExtension> {
  assertHasRole(authzData, requestedRole);
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
