import z from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import type { Brand } from '@prairielearn/utils';

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
type PageAuthzDataInput = z.input<typeof PageAuthzDataSchema>;

export interface DangerousSystemAuthzData {
  authn_user: {
    id: null;
  };
  user: {
    id: null;
  };
}

/**
 * Contains the authorization results for a user in the context of a specific
 * course or course instance.
 *
 * Does not take into account effective user data or permissions.
 */
interface RawPlainAuthzData {
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
}
export type PlainAuthzData = Brand<RawPlainAuthzData, 'PlainAuthzData'>;

export interface ConstructedCourseOrInstanceSuccessContext {
  authzData: PlainAuthzData;
  course: Course;
  institution: Institution;
  courseInstance: CourseInstance | null;
}

export type ConstructedCourseOrInstanceContext =
  | {
      authzData: null;
      course: null;
      institution: null;
      courseInstance: null;
    }
  | ConstructedCourseOrInstanceSuccessContext;

/** The full authz data from a database query. This is NOT what is on res.locals. */
export const CourseOrInstanceContextDataSchema = z.object({
  mode: EnumModeSchema,
  mode_reason: EnumModeReasonSchema,
  course: CourseSchema,
  institution: InstitutionSchema,
  course_instance: CourseInstanceSchema.nullable(),
  permissions_course: SprocAuthzCourseSchema,
  permissions_course_instance: SprocAuthzCourseInstanceSchema,
});
export type CourseOrInstanceContextData = z.infer<typeof CourseOrInstanceContextDataSchema>;

export type AuthzDataWithoutEffectiveUser = PlainAuthzData | DangerousSystemAuthzData;

export type AuthzDataWithEffectiveUser =
  | RawPageAuthzData
  | PageAuthzData
  | DangerousSystemAuthzData;

export type AuthzData = AuthzDataWithoutEffectiveUser | AuthzDataWithEffectiveUser;

// More information about these roles can be found in the "Permission checking" section of the developer guide.

export type SystemRole = 'System';

export type StudentCourseInstanceRole = 'Student';

export type InstructorCourseInstanceRole = 'Student Data Viewer' | 'Student Data Editor';

export type CourseRole = 'Previewer' | 'Viewer' | 'Editor' | 'Owner';

export type Role =
  | SystemRole
  | StudentCourseInstanceRole
  | InstructorCourseInstanceRole
  | CourseRole;

export function dangerousFullSystemAuthz(): DangerousSystemAuthzData {
  return {
    authn_user: {
      // We use this structure with a id of null to indicate that the user is the system.
      // Inserts into the audit_events table as a system user have a id of null.
      id: null,
    },
    user: {
      id: null,
    },
  };
}

export function isDangerousFullSystemAuthz(
  authzData: AuthzDataWithoutEffectiveUser | AuthzDataWithEffectiveUser,
): authzData is DangerousSystemAuthzData {
  return authzData.user.id === null;
}

export function hasRole(authzData: AuthzData, requiredRole: Role[]): boolean {
  /* System roles */
  if (isDangerousFullSystemAuthz(authzData)) {
    // You must include 'System' in the requiredRole when you use dangerousFullSystemAuthz.
    return requiredRole.includes('System');
  }

  /* Student course instance roles */
  if (
    requiredRole.includes('Student') &&
    authzData.has_student_access &&
    // If the user is an instructor, and the requiredRole is student, this should fail.
    // We want to prevent instructors from calling functions that are only meant for students.
    //
    // This can happen if the instructor is in 'Student view' (with access restrictions) as well.
    authzData.course_instance_role === 'None'
  ) {
    return true;
  }

  /* Instructor course instance roles */
  if (
    requiredRole.includes('Student Data Viewer') &&
    authzData.has_course_instance_permission_view
  ) {
    return true;
  }

  if (
    requiredRole.includes('Student Data Editor') &&
    authzData.has_course_instance_permission_edit
  ) {
    return true;
  }

  /* Course roles */
  if (requiredRole.includes('Previewer') && authzData.has_course_permission_preview) {
    return true;
  }

  if (requiredRole.includes('Viewer') && authzData.has_course_permission_view) {
    return true;
  }

  if (requiredRole.includes('Editor') && authzData.has_course_permission_edit) {
    return true;
  }

  if (requiredRole.includes('Owner') && authzData.has_course_permission_own) {
    return true;
  }

  return false;
}

/**
 * Asserts that the requiredRole passed by the caller is allowed for the type of action being performed by the model function.
 *
 * Most model functions enforce the required role at the type level, so this function is not needed.
 * For model functions in which the authorization required depends on the action, this function can be used to
 * check, at runtime, that the role is allowed for the action.
 *
 * This function is called by the model function to assert that the role is allowed for the model function.
 *
 * @param requiredRole The potential roles.
 * @param permittedRoles The roles permitted for the action.
 */
export function assertRoleIsPermitted(requiredRole: Role[], permittedRoles: Role[]): void {
  // Assert that requiredRole is a subset of allowedRoles
  for (const role of requiredRole) {
    if (!permittedRoles.includes(role)) {
      throw new Error(
        `Required role "${role}" is not permitted for this action. Permitted roles: "${permittedRoles.join('", "')}"`,
      );
    }
  }
}
/**
 * Asserts that the user has the required role. If requiredRole is a list of multiple roles,
 * it asserts that the user has at least one of the required roles.
 *
 * @example
 *
 * ```typescript
 * function myModelFunction(... : { authzData: AuthzData, requiredRole: ('Student' | 'Student Data Viewer' | 'Student Data Editor')[] }): void {
 *   assertHasRole(authzData, requiredRole);
 * }
 *
 * myModelFunction({ authzData, requiredRole: ['Student', 'Student Data Viewer'] });
 * ```
 *
 * In this call, the model function requires that the user must be a Student, Student Data Viewer, or Student Data Editor.
 *
 * The caller of the model function wants to assert that the user is either a Student or Student Data Viewer.
 *
 * @example
 * ```typescript
 * function myModelFunction(... : { authzData: AuthzData, requiredRole: ('Student Data Viewer' | 'Student Data Editor')[] }): void {
 *   assertHasRole(authzData, requiredRole);
 * }
 *
 * myModelFunction({ authzData, requiredRole: ['Student Data Viewer'] });
 * ```
 *
 * In this call, the model function requires that the user must be a Student Data Viewer or Student Data Editor.
 *
 * The caller of the model function wants to assert that the user has the Student Data Viewer role.
 *
 * @param authzData - The authorization data of the user.
 * @param requiredRole - The required role by the model function. Provided by the caller of the model function.
 */
export function assertHasRole(authzData: AuthzData, requiredRole: Role[]): void {
  if (!hasRole(authzData, requiredRole)) {
    throw new HttpStatusError(403, 'Access denied');
  }
}

export function calculateCourseRolePermissions(role: EnumCourseRole) {
  return {
    has_course_permission_preview: ['Previewer', 'Viewer', 'Editor', 'Owner'].includes(role),
    has_course_permission_view: ['Viewer', 'Editor', 'Owner'].includes(role),
    has_course_permission_edit: ['Editor', 'Owner'].includes(role),
    has_course_permission_own: ['Owner'].includes(role),
  };
}

export function calculateCourseInstanceRolePermissions(role: EnumCourseInstanceRole) {
  return {
    has_course_instance_permission_view: ['Student Data Viewer', 'Student Data Editor'].includes(
      role,
    ),
    has_course_instance_permission_edit: ['Student Data Editor'].includes(role),
  };
}

/**
 * Converts a `PlainAuthzData` into a `PageAuthzData`. Assumes that the context
 * in which this is called does not differentiate between authenticated user and
 * effective user.
 *
 * This function is a temporary solution until we can add `is_administrator` to
 * `PlainAuthzData` directly, and teach model functions how to work with both
 * `PlainAuthzData` and `PageAuthzData`.
 */
export function makePageAuthzData({
  authzData,
  is_administrator,
}: {
  authzData: PlainAuthzData;
  is_administrator: boolean;
}): PageAuthzData {
  const input: PageAuthzDataInput = {
    ...authzData,
    is_administrator,

    authn_user: authzData.user,
    authn_is_administrator: is_administrator,

    authn_has_course_permission_preview: authzData.has_course_permission_preview,
    authn_has_course_permission_view: authzData.has_course_permission_view,
    authn_has_course_permission_edit: authzData.has_course_permission_edit,
    authn_has_course_permission_own: authzData.has_course_permission_own,
    authn_course_role: authzData.course_role,
  };

  if (authzData.course_instance_role != null) {
    Object.assign(input, {
      authn_course_instance_role: authzData.course_instance_role,
      authn_has_course_instance_permission_view: authzData.has_course_instance_permission_view,
      authn_has_course_instance_permission_edit: authzData.has_course_instance_permission_edit,
      authn_has_student_access: authzData.has_student_access,
      authn_has_student_access_with_enrollment: authzData.has_student_access_with_enrollment,
    } satisfies Partial<PageAuthzDataInput>);
  }

  return PageAuthzDataSchema.parse(input);
}
