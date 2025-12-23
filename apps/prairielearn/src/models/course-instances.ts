import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow, queryRow, queryRows } from '@prairielearn/postgres';
import { DateFromISOString } from '@prairielearn/zod';

import {
  type AuthzData,
  type CourseRole,
  type InstructorCourseInstanceRole,
  type PageAuthzData,
  assertHasRole,
} from '../lib/authz-data-lib.js';
import type { PageContext } from '../lib/client/page-context.js';
import {
  type Course,
  type CourseInstance,
  CourseInstanceSchema,
  UserSchema,
} from '../lib/db-types.js';
import { idsEqual } from '../lib/id.js';

type CourseContext = Course | PageContext<'course', 'student' | 'instructor'>['course'];

const sql = loadSqlEquiv(import.meta.url);

const CourseInstanceAuthzSchema = CourseInstanceSchema.extend({
  /** The earliest start date of an access rule. */
  start_date: DateFromISOString.nullable(),
  /** The latest end date of an access rule. */
  end_date: DateFromISOString.nullable(),
  /** @deprecated Use start_date instead. */
  formatted_start_date: z.string(),
  /** @deprecated Use end_date instead. */
  formatted_end_date: z.string(),
  has_course_instance_permission_view: z.boolean(),
  has_course_instance_permission_edit: z.boolean(),
});
export type CourseInstanceAuthz = z.infer<typeof CourseInstanceAuthzSchema>;

export async function selectCourseInstanceById(id: string) {
  return await queryRow(
    sql.select_course_instance_by_id,
    { course_instance_id: id },
    CourseInstanceSchema,
  );
}

export async function selectOptionalCourseInstanceById(id: string) {
  return await queryOptionalRow(
    sql.select_course_instance_by_id,
    { course_instance_id: id },
    CourseInstanceSchema,
  );
}

export async function selectCourseInstanceByShortName({
  course,
  shortName,
}: {
  course: Course;
  shortName: string;
}): Promise<CourseInstance> {
  return queryRow(
    sql.select_course_instance_by_short_name,
    { course_id: course.id, short_name: shortName },
    CourseInstanceSchema,
  );
}

export async function selectOptionalCourseInstanceIdByEnrollmentCode({
  enrollmentCode,
}: {
  enrollmentCode: string;
}): Promise<string | null> {
  const courseInstance = await queryOptionalRow(
    sql.select_course_instance_by_enrollment_code,
    { enrollment_code: enrollmentCode },
    CourseInstanceSchema,
  );

  return courseInstance?.id ?? null;
}

/**
 * Returns all course instances to which the given user has staff access.
 *
 * If the user is emulating another user, the results will be filtered to only
 * include course instances to which both the authenticated user and the
 * emulated user have access.
 */
export async function selectCourseInstancesWithStaffAccess({
  course,
  authzData,
  requiredRole,
}: {
  course: CourseContext;
  authzData: PageAuthzData;
  requiredRole: (CourseRole | InstructorCourseInstanceRole)[];
}) {
  assertHasRole(authzData, requiredRole);

  const authnCourseInstances = await queryRows(
    sql.select_course_instances_with_staff_access,
    {
      user_id: authzData.user.user_id,
      is_administrator: authzData.is_administrator,
      course_id: course.id,
    },
    CourseInstanceAuthzSchema,
  );

  if (idsEqual(authzData.user.user_id, authzData.authn_user.user_id)) {
    return authnCourseInstances;
  }

  const authzCourseInstances = await queryRows(
    sql.select_course_instances_with_staff_access,
    {
      user_id: authzData.user.user_id,
      is_administrator: authzData.is_administrator,
      course_id: course.id,
    },
    CourseInstanceAuthzSchema,
  );

  // Retain only the course instances for which the authn user also has access.
  const authnCourseIds = new Set(authnCourseInstances.map((c) => c.id));
  return authzCourseInstances.filter((authzCourseInstance) => {
    return authnCourseIds.has(authzCourseInstance.id);
  });
}

/**
 * Returns all users with at least the given minimal role for the given course instance.
 *
 * @param params
 * @param params.authzData - The authorization data of the user.
 * @param params.requiredRole - The required role that the model function checks for.
 * @param params.courseInstance - The course instance to check access for.
 * @param params.minimalRole - The minimal role to check access for.
 *
 * @returns All users with at least the given minimal role for the given course instance.
 */
export async function selectUsersWithCourseInstanceAccess({
  courseInstance,
  authzData,
  requiredRole,
  minimalRole,
}: {
  courseInstance: CourseInstance;
  authzData: AuthzData;
  requiredRole: ('Student Data Viewer' | 'Student Data Editor')[];
  minimalRole: 'Student Data Viewer' | 'Student Data Editor';
}) {
  assertHasRole(authzData, requiredRole);

  return await queryRows(
    sql.select_users_with_course_instance_access,
    { course_instance_id: courseInstance.id, minimal_role: minimalRole },
    UserSchema,
  );
}

export async function selectCourseInstanceGraderStaff({
  courseInstance,
  authzData,
  requiredRole,
}: {
  courseInstance: CourseInstance;
  authzData: AuthzData;
  requiredRole: ('Student Data Viewer' | 'Student Data Editor')[];
}) {
  assertHasRole(authzData, requiredRole);

  return await selectUsersWithCourseInstanceAccess({
    authzData,
    requiredRole,
    courseInstance,
    minimalRole: 'Student Data Editor',
  });
}

/**
 * Returns if the course has any non-deleted course instances.
 */
export async function selectCourseHasCourseInstances({
  course,
}: {
  course: CourseContext;
}): Promise<boolean> {
  return await queryRow(
    sql.select_course_has_course_instances,
    { course_id: course.id },
    z.boolean(),
  );
}

export async function selectCourseInstanceByUuid({
  course,
  uuid,
}: {
  course: CourseContext;
  uuid: string;
}): Promise<CourseInstance> {
  return await queryRow(
    sql.select_course_instance_by_uuid,
    { uuid, course_id: course.id },
    CourseInstanceSchema,
  );
}
