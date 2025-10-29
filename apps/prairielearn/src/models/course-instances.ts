import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow, queryRow, queryRows } from '@prairielearn/postgres';

import { assertHasRole } from '../lib/authzData.js';
import type { AuthzData } from '../lib/authzData.types.js';
import {
  type Course,
  type CourseInstance,
  type CourseInstancePermission,
  CourseInstanceSchema,
  UserSchema,
} from '../lib/db-types.js';
import { idsEqual } from '../lib/id.js';

const sql = loadSqlEquiv(import.meta.url);

const CourseInstanceAuthzSchema = CourseInstanceSchema.extend({
  formatted_start_date: z.string(),
  formatted_end_date: z.string(),
  has_course_instance_permission_view: z.boolean(),
  has_course_instance_permission_edit: z.boolean(),
});
export type CourseInstanceAuthz = z.infer<typeof CourseInstanceAuthzSchema>;

export async function selectCourseInstanceById({
  id,
  requestedRole,
  authzData,
}: {
  id: string;
  requestedRole: 'System' | 'Student' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
  authzData: AuthzData;
}) {
  const courseInstance = await queryRow(
    sql.select_course_instance_by_id,
    { course_instance_id: id },
    CourseInstanceSchema,
  );

  if (courseInstance.share_source_publicly) {
    return courseInstance;
  }
  assertHasRole(authzData, requestedRole);

  return courseInstance;
}

export async function selectOptionalCourseInstanceById({
  id,
  requestedRole,
  authzData,
}: {
  id: string;
  requestedRole: 'System' | 'Student' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
  authzData: AuthzData;
}): Promise<CourseInstance | null> {
  const courseInstance = await queryOptionalRow(
    sql.select_course_instance_by_id,
    { course_instance_id: id },
    CourseInstanceSchema,
  );

  if (courseInstance === null) {
    return null;
  }

  if (courseInstance.share_source_publicly) {
    return courseInstance;
  }

  assertHasRole(authzData, requestedRole);

  return courseInstance;
}

export async function selectCourseInstanceByShortName({
  course,
  short_name,
}: {
  course: Course;
  short_name: string;
}): Promise<CourseInstance> {
  return queryRow(
    sql.select_course_instance_by_short_name,
    { course_id: course.id, short_name },
    CourseInstanceSchema,
  );
}

export async function selectOptionalCourseInstanceByEnrollmentCode({
  enrollment_code,
  requestedRole,
  authzData,
}: {
  enrollment_code: string;
  requestedRole: 'System' | 'Student' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
  authzData: AuthzData;
}): Promise<CourseInstance | null> {
  const courseInstance = await queryOptionalRow(
    sql.select_course_instance_by_enrollment_code,
    { enrollment_code },
    CourseInstanceSchema,
  );

  if (courseInstance == null) {
    return null;
  }

  if (courseInstance.share_source_publicly) {
    return courseInstance;
  }

  assertHasRole(authzData, requestedRole);
  return courseInstance;
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
  user_id,
  authn_user_id,
  is_administrator,
  authn_is_administrator,
}: {
  course: Course;
  user_id: string;
  authn_user_id: string;
  is_administrator: boolean;
  authn_is_administrator: boolean;
}) {
  const authnCourseInstances = await queryRows(
    sql.select_course_instances_with_staff_access,
    { user_id: authn_user_id, is_administrator: authn_is_administrator, course_id: course.id },
    CourseInstanceAuthzSchema,
  );

  if (idsEqual(user_id, authn_user_id)) {
    return authnCourseInstances;
  }

  const authzCourseInstances = await queryRows(
    sql.select_course_instances_with_staff_access,
    { user_id, is_administrator, course_id: course.id },
    CourseInstanceAuthzSchema,
  );

  // Retain only the course instances for which the authn user also has access.
  const authnCourseIds = new Set(authnCourseInstances.map((c) => c.id));
  return authzCourseInstances.filter((authzCourseInstance) => {
    return authnCourseIds.has(authzCourseInstance.id);
  });
}

export async function selectUsersWithCourseInstanceAccess({
  course_instance,
  minimal_role,
}: {
  course_instance: CourseInstance;
  minimal_role: Exclude<CourseInstancePermission['course_instance_role'], null>;
}) {
  return await queryRows(
    sql.select_users_with_course_instance_access,
    { course_instance_id: course_instance.id, minimal_role },
    UserSchema,
  );
}

export async function selectCourseInstanceGraderStaff({
  course_instance,
}: {
  course_instance: CourseInstance;
}) {
  return await selectUsersWithCourseInstanceAccess({
    course_instance,
    minimal_role: 'Student Data Editor',
  });
}

/**
 * Returns if the course has any non-deleted course instances.
 */
export async function selectCourseHasCourseInstances({
  course,
}: {
  course: Course;
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
  course: Course;
  uuid: string;
}): Promise<CourseInstance> {
  return await queryRow(
    sql.select_course_instance_by_uuid,
    { uuid, course_id: course.id },
    CourseInstanceSchema,
  );
}
