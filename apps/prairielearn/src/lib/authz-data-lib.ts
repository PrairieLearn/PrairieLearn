import z from 'zod';

import { HttpStatusError } from '@prairielearn/error';

import { RawStaffUserSchema, StaffUserSchema } from './client/safe-db-types.js';
import {
  type Course,
  type CourseInstance,
  CourseInstanceSchema,
  CourseSchema,
  type EnumCourseInstanceRole,
  EnumCourseInstanceRoleSchema,
  type EnumCourseRole,
  EnumCourseRoleSchema,
  type EnumMode,
  type EnumModeReason,
  EnumModeReasonSchema,
  EnumModeSchema,
  type Institution,
  InstitutionSchema,
  SprocAuthzCourseInstanceSchema,
  SprocAuthzCourseSchema,
  type User,
} from './db-types.js';

/**
 * This schema isn't used to directly validate the authz data that ends up in
 * `res.locals.authz_data`. This (and the branded version below) only exist for
 * the sake of "page context" functions and types.
 */
const RawPageAuthzDataSchema = z.object({
  // TODO: split this into "course" and "course instance" variants with the
  // correct properties for each case.
  authn_user: RawStaffUserSchema,
  authn_is_administrator: z.boolean(),
  authn_has_course_permission_preview: z.boolean().optional(),
  authn_has_course_permission_view: z.boolean().optional(),
  authn_has_course_permission_edit: z.boolean().optional(),
  authn_has_course_permission_own: z.boolean().optional(),
  authn_course_role: EnumCourseRoleSchema.optional(),
  authn_course_instance_role: EnumCourseInstanceRoleSchema.optional(),
  authn_mode: z.string().optional(),
  authn_has_student_access: z.boolean().optional(),
  authn_has_student_access_with_enrollment: z.boolean().optional(),
  authn_has_course_instance_permission_view: z.boolean().optional(),
  authn_has_course_instance_permission_edit: z.boolean().optional(),

  // Authz data
  user: RawStaffUserSchema,
  is_administrator: z.boolean(),
  has_course_permission_preview: z.boolean(),
  has_course_permission_view: z.boolean(),
  has_course_permission_edit: z.boolean(),
  has_course_permission_own: z.boolean(),
  course_role: EnumCourseRoleSchema.optional(),
  course_instance_role: EnumCourseInstanceRoleSchema.optional(),
  mode: EnumModeSchema.optional(),
  has_student_access: z.boolean().optional(),
  has_student_access_with_enrollment: z.boolean().optional(),
  has_course_instance_permission_view: z.boolean().optional(),
  has_course_instance_permission_edit: z.boolean().optional(),
});
export type RawPageAuthzData = z.infer<typeof RawPageAuthzDataSchema>;

export const PageAuthzDataSchema = RawPageAuthzDataSchema.extend({
  user: StaffUserSchema,
  authn_user: StaffUserSchema,
}).brand<'PageAuthzData'>();
export type PageAuthzData = z.infer<typeof PageAuthzDataSchema>;

export interface DangerousSystemAuthzData {
  authn_user: {
    user_id: null;
  };
  user: {
    user_id: null;
  };
}

export interface CalculateAuthDataSuccessResult {
  authResult: {
    user: User;

    course_role: EnumCourseRole;
    has_course_permission_preview: boolean;
    has_course_permission_view: boolean;
    has_course_permission_edit: boolean;
    has_course_permission_own: boolean;

    course_instance_role?: EnumCourseInstanceRole;
    has_course_instance_permission_view?: boolean;
    has_course_instance_permission_edit?: boolean;
    has_student_access_with_enrollment?: boolean;
    has_student_access?: boolean;

    mode: EnumMode;
    mode_reason: EnumModeReason;
  };
  course: Course;
  institution: Institution;
  courseInstance: CourseInstance | null;
}

export type CalculateAuthDataResult =
  | {
      authResult: null;
      course: null;
      institution: null;
      courseInstance: null;
    }
  | CalculateAuthDataSuccessResult;

/** The full authz data from a database query. This is NOT what is on res.locals. */
export const FullAuthzDataSchema = z.object({
  mode: EnumModeSchema,
  mode_reason: EnumModeReasonSchema,
  course: CourseSchema,
  institution: InstitutionSchema,
  course_instance: CourseInstanceSchema.nullable(),
  permissions_course: SprocAuthzCourseSchema,
  permissions_course_instance: SprocAuthzCourseInstanceSchema,
});
export type FullAuthzData = z.infer<typeof FullAuthzDataSchema>;

export type AuthzDataWithoutEffectiveUser =
  | CalculateAuthDataSuccessResult['authResult']
  | DangerousSystemAuthzData;

export type AuthzDataWithEffectiveUser = PageAuthzData | DangerousSystemAuthzData;

export type AuthzData = AuthzDataWithoutEffectiveUser | AuthzDataWithEffectiveUser;

export type CourseInstanceRole =
  | 'System'
  | 'None'
  | 'Student'
  | 'Student Data Viewer'
  | 'Student Data Editor'
  // The role 'Any' is equivalent to 'Student' OR 'Student Data Viewer' OR 'Student Data Editor'
  | 'Any';

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
  authzData: AuthzDataWithoutEffectiveUser | AuthzDataWithEffectiveUser,
): authzData is DangerousSystemAuthzData {
  return authzData.user.user_id === null;
}

export function hasRole(authzData: AuthzData, requestedRole: CourseInstanceRole): boolean {
  // You must set the requestedRole to 'System' when you use dangerousFullSystemAuthz.
  if (isDangerousFullSystemAuthz(authzData)) {
    return ['System', 'Any'].includes(requestedRole);
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
    throw new HttpStatusError(403, 'Access denied');
  }
}
