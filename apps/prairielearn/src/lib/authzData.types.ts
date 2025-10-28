import z from 'zod';

import { RawStaffUserSchema, StaffUserSchema } from './client/safe-db-types.js';
import {
  CourseInstanceSchema,
  CourseSchema,
  EnumCourseInstanceRoleSchema,
  EnumCourseRoleSchema,
  EnumModeReasonSchema,
  EnumModeSchema,
  InstitutionSchema,
  SprocAuthzCourseInstanceSchema,
  SprocAuthzCourseSchema,
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

export type CourseInstanceRole =
  | 'System'
  | 'None'
  | 'Student'
  | 'Student Data Viewer'
  | 'Student Data Editor'
  // The role 'Any' is equivalent to 'Student' OR 'Student Data Viewer' OR 'Student Data Editor'
  | 'Any';

export type AuthzData = RawPageAuthzData | DangerousSystemAuthzData;

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {}; // Force typescript to resolve the type immediately

/**
 * The user facing type for a model function that is authenticated.
 *
 * Do not destructure the authentication parameters in the function signature.
 *
 * Instead, destructure them in the function body.
 *
 * ```typescript
 * function foo({ myParam1, myParam2, ...authParams }: AuthenticatedModel<...>) {
 *   const { requestedRole } = authParams;
 *   ...
 * }
 * ```
 *
 * @param Params - The parameters of the model function.
 * @param Roles - The roles that are allowed to call the model function.
 * @returns The type for the model function
 */
// TODO: We want to iterate on this further.
export type AuthenticatedModel<
  Params extends Record<string, any> & {
    requestedRole: CourseInstanceRole;
  },
> = Prettify<
  | (Params & {
      authzData: RawPageAuthzData;
    })
  | (Omit<Params, 'requestedRole'> & {
      requestedRole: undefined;
      authzData: DangerousSystemAuthzData;
    })
>;
