import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import {
  type AuthzData,
  type CourseInstanceRole,
  type DangerousSystemAuthzData,
  FullAuthzDataSchema,
} from './authzData.types.js';

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

export function dangerousFullSystemAuthz(): DangerousSystemAuthzData {
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

export function isDangerousFullSystemAuthz(
  authzData: AuthzData,
): authzData is DangerousSystemAuthzData {
  return authzData.authn_user.user_id === null && authzData.user.user_id === null;
}

export function hasRole(authzData: AuthzData, requestedRole: CourseInstanceRole): boolean {
  if (isDangerousFullSystemAuthz(authzData)) {
    return true;
  }

  if (requestedRole === 'System') {
    return false;
  }

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
