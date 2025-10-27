import z from 'zod';

import { type RawStaffUser, StaffUserSchema } from './client/safe-db-types.js';
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

const RawPageAuthzDataSchema = z.object({
  // TODO: Type these more accurately into a course instance version.
  authn_user: StaffUserSchema,
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
  is_administrator: z.boolean(),
  has_course_permission_preview: z.boolean(),
  has_course_permission_view: z.boolean(),
  has_course_permission_edit: z.boolean(),
  has_course_permission_own: z.boolean(),
  course_role: EnumCourseRoleSchema.optional(),
  course_instance_role: EnumCourseInstanceRoleSchema.optional(),
  mode: z.string().optional(),
  has_student_access: z.boolean().optional(),
  has_student_access_with_enrollment: z.boolean().optional(),
  has_course_instance_permission_view: z.boolean().optional(),
  has_course_instance_permission_edit: z.boolean().optional(),

  user: StaffUserSchema,
});

export type RawPageAuthzData = Omit<
  z.infer<typeof RawPageAuthzDataSchema>,
  'user' | 'authn_user'
> & {
  user: RawStaffUser;
  authn_user: RawStaffUser;
};
export const PageAuthzDataSchema = RawPageAuthzDataSchema.brand<'PageAuthzData'>();
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

/** The user facing version that is obtained via the page context helpers. */
export type AuthzData = RawPageAuthzData | DangerousSystemAuthzData;
