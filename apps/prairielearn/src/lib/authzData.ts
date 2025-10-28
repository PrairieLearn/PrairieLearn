import assert from 'assert';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { selectPublishingExtensionsByEnrollmentId } from '../models/course-instance-publishing-extensions.js';
import { selectOptionalEnrollmentByUserId } from '../models/enrollment.js';

import {
  type AuthzData,
  type DangerousSystemAuthzData,
  FullAuthzDataSchema,
  type RawPageAuthzData,
} from './authzData.types.js';
import { type CourseInstance, type User } from './db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * If course_id is not provided, but course_instance_id is,
 * the function will use the course_id from the course instance.
 */
export async function selectAuthzData({
  user_id,
  course_id,
  course_instance_id,
  is_administrator,
  allow_example_course_override,
  ip,
  req_date,
  req_mode,
  req_course_role,
  req_course_instance_role,
}: {
  user_id: string;
  course_id: string | null;
  course_instance_id: string | null;
  is_administrator: boolean;
  allow_example_course_override: boolean;
  ip: string | null;
  req_date: Date;
  req_mode: string | null;
  req_course_role: string | null;
  req_course_instance_role: string | null;
}) {
  return sqldb.queryOptionalRow(
    sql.select_authz_data,
    {
      user_id,
      course_id,
      course_instance_id,
      is_administrator,
      allow_example_course_override,
      ip,
      req_date,
      req_mode,
      req_course_role,
      req_course_instance_role,
    },
    FullAuthzDataSchema,
  );
}

/**
 * Checks if the user has access to the course instance. If the user is a student,
 * the course instance must be published to them.
 *
 * This function is only used by authzData.ts
 *
 * @param courseInstance - The course instance to check access for.
 * @param authzData - The authorization data of the user.
 * @param reqDate - The date of the request.
 */
export async function hasModernCourseInstanceStudentAccess(
  courseInstance: CourseInstance,
  authzData: RawPageAuthzData,
  reqDate: Date,
) {
  const enrollment = await selectOptionalEnrollmentByUserId({
    userId: authzData.user.user_id,
    requestedRole: 'Student',
    authzData,
    courseInstance,
  });

  // We only consider non-legacy publishing.
  if (!courseInstance.modern_publishing) {
    throw new Error('Course instance is not using modern publishing');
  }

  // Not published at all.
  if (courseInstance.publishing_start_date == null) {
    return { has_student_access: false, has_student_access_with_enrollment: false };
  }
  // End date is always set alongside start date
  assert(courseInstance.publishing_end_date != null);

  // Before the start date, we definitely don't have access.
  if (reqDate < courseInstance.publishing_start_date) {
    return { has_student_access: false, has_student_access_with_enrollment: false };
  }

  //If we are before the end date and after the start date, we definitely have access.
  if (reqDate < courseInstance.publishing_end_date) {
    return { has_student_access: true, has_student_access_with_enrollment: enrollment != null };
  }

  // We are after the end date. We might have access if we have an extension.
  const publishingExtensions =
    enrollment != null ? await selectPublishingExtensionsByEnrollmentId(enrollment.id) : [];

  // There are no extensions. We don't have access.
  if (publishingExtensions.length === 0) {
    return { has_student_access: false, has_student_access_with_enrollment: false };
  }

  // Consider the latest enabled date for the enrollment.
  const allDates = publishingExtensions
    .map((extension) => extension.end_date)
    .sort((a, b) => {
      return b.getTime() - a.getTime();
    });
  const latestDate = allDates[0];

  // If we are before the latest date, we have access.
  return {
    has_student_access: reqDate < latestDate,
    has_student_access_with_enrollment: reqDate < latestDate && enrollment != null,
  };
}
/**
 * Builds the authorization data for a user on a page.
 *
 * @param params
 * @param params.authn_user - The authenticated user.
 * @param params.course_id - The ID of the course. If not provided,
 * but course_instance_id is provided, the function will use the course_id from the course instance.
 * @param params.course_instance_id - The ID of the course instance.
 * @param params.is_administrator - Whether the user is an administrator.
 * @param params.ip - The IP address of the request.
 * @param params.req_date - The date of the request.
 * @param params.req_mode - The mode of the request.
 */
export async function buildAuthzData({
  authn_user,
  course_id,
  course_instance_id,
  is_administrator,
  ip,
  req_date,
  req_mode = null,
}: {
  authn_user: User;
  course_id: string | null;
  course_instance_id: string | null;
  is_administrator: boolean;
  ip: string | null;
  req_date: Date;
  req_mode?: string | null;
}) {
  const isCourseInstance = Boolean(course_instance_id);

  const rawAuthzData = await selectAuthzData({
    user_id: authn_user.user_id,
    course_id,
    course_instance_id,
    is_administrator,
    allow_example_course_override: true,
    ip,
    req_date,
    req_mode,
    req_course_role: null,
    req_course_instance_role: null,
  });

  if (rawAuthzData === null) {
    return {
      authzData: null,
      authzCourse: null,
      authzInstitution: null,
      authzPermissionsCourse: null,
      authzCourseInstance: null,
    };
  }

  const permissions_course = rawAuthzData.permissions_course;

  const authzData = {
    authn_user: structuredClone(authn_user),
    authn_mode: rawAuthzData.mode,
    authn_mode_reason: rawAuthzData.mode_reason,
    authn_is_administrator: is_administrator,
    authn_course_role: permissions_course.course_role,
    authn_has_course_permission_preview: permissions_course.has_course_permission_preview,
    authn_has_course_permission_view: permissions_course.has_course_permission_view,
    authn_has_course_permission_edit: permissions_course.has_course_permission_edit,
    authn_has_course_permission_own: permissions_course.has_course_permission_own,
    user: structuredClone(authn_user),
    mode: rawAuthzData.mode,
    mode_reason: rawAuthzData.mode_reason,
    is_administrator,
    course_role: permissions_course.course_role,
    has_course_permission_preview: permissions_course.has_course_permission_preview,
    has_course_permission_view: permissions_course.has_course_permission_view,
    has_course_permission_edit: permissions_course.has_course_permission_edit,
    has_course_permission_own: permissions_course.has_course_permission_own,
    ...run(() => {
      if (!isCourseInstance) return {};

      const {
        course_instance_role,
        has_course_instance_permission_view,
        has_course_instance_permission_edit,
        has_student_access,
        has_student_access_with_enrollment,
      } = rawAuthzData.permissions_course_instance;
      return {
        authn_course_instance_role: course_instance_role,
        authn_has_course_instance_permission_view: has_course_instance_permission_view,
        authn_has_course_instance_permission_edit: has_course_instance_permission_edit,
        authn_has_student_access: has_student_access,
        authn_has_student_access_with_enrollment: has_student_access_with_enrollment,
        course_instance_role,
        has_course_instance_permission_view,
        has_course_instance_permission_edit,
        has_student_access_with_enrollment,
        has_student_access,
      };
    }),
  };

  if (rawAuthzData.course_instance?.modern_publishing) {
    // We use this access system instead of the legacy access system.
    const { has_student_access, has_student_access_with_enrollment } =
      await hasModernCourseInstanceStudentAccess(rawAuthzData.course_instance, authzData, req_date);
    authzData.has_student_access = has_student_access;
    authzData.has_student_access_with_enrollment = has_student_access_with_enrollment;
  }

  return {
    authzData,
    authzCourse: rawAuthzData.course,
    authzInstitution: rawAuthzData.institution,
    authzCourseInstance: rawAuthzData.course_instance,
  };
}

export type CourseInstanceRole =
  | 'None'
  | 'Student'
  | 'Student Data Viewer'
  | 'Student Data Editor'
  // The role 'Any' is equivalent to 'Student' OR 'Student Data Viewer' OR 'Student Data Editor'
  | 'Any';

export function dangerousFullAuthzForTesting(): DangerousSystemAuthzData {
  return {
    authn_user: {
      // We use this structure with a user_id of null to indicate that the user is the system.
      // Inserts into the audit_events table as a system user have a user_id of null.
      user_id: null,
    },
    user: {
      user_id: null,
    },
  };
}

export function isDangerousFullAuthzForTesting(
  authzData: AuthzData,
): authzData is DangerousSystemAuthzData {
  return authzData.authn_user.user_id === null && authzData.user.user_id === null;
}

export function hasRole(authzData: AuthzData, requestedRole: CourseInstanceRole): boolean {
  if (isDangerousFullAuthzForTesting(authzData)) {
    return true;
  }

  // TODO: This assumes the legacy access system.
  // We should have some wrapper around hasRole that handles the modern access system.
  if (
    (requestedRole === 'Student' || requestedRole === 'Any') &&
    authzData.has_student_access &&
    // If the user is an instructor, and the requestedRole is student, this should fail.
    // We want to prevent instructors from calling functions that are only meant for students.
    //
    // This can happen if the instructor is in 'Student view' (with access restrictions) as well.
    authzData.course_instance_role === 'None'
  ) {
    return true;
  }

  if (
    (requestedRole === 'Student Data Viewer' || requestedRole === 'Any') &&
    authzData.has_course_instance_permission_view
  ) {
    return true;
  }

  if (
    (requestedRole === 'Student Data Editor' || requestedRole === 'Any') &&
    authzData.has_course_instance_permission_edit
  ) {
    return true;
  }

  if (requestedRole === 'None') {
    return true;
  }

  return false;
}

/**
 * Asserts that the user has the requested role. It also asserts that
 * the requested role is one of the allowed roles.
 * If the model function enforces `requestedRole` at the type level, `allowedRoles` is not needed.
 *
 * For staff roles, it checks that you have at least the requested role.
 * role. If you have a more permissive role, you are allowed to perform the action.
 *
 * @param authzData - The authorization data of the user.
 * @param requestedRole - The requested role from the caller of the model function.
 * @param allowedRoles - The allowed roles for the model function.
 */
export function assertHasRole(
  authzData: AuthzData,
  requestedRole: CourseInstanceRole,
  allowedRoles?: CourseInstanceRole[],
): void {
  if (allowedRoles && requestedRole !== 'Any' && !allowedRoles.includes(requestedRole)) {
    // This suggests the code was called incorrectly (internal error).
    throw new Error(
      `Requested role "${requestedRole}" is not allowed for this action. Allowed roles: "${allowedRoles.join('", "')}"`,
    );
  }

  if (!hasRole(authzData, requestedRole)) {
    throw new error.HttpStatusError(403, 'Access denied');
  }
}
