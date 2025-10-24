import { z } from 'zod';

import { run } from '@prairielearn/run';

import { NavPageSchema, NavbarTypeSchema } from '../../components/Navbar.types.js';
import { SelectUserSchema } from '../authn.types.js';
import { EnumCourseInstanceRoleSchema, EnumCourseRoleSchema } from '../db-types.js';

import {
  RawStaffAssessmentSchema,
  RawStaffAssessmentSetSchema,
  RawStaffCourseInstanceSchema,
  RawStaffCourseSchema,
  type RawStaffUser,
  RawStudentCourseInstanceSchema,
  RawStudentCourseSchema,
  StaffInstitutionSchema,
  StaffUserSchema,
} from './safe-db-types.js';

const RawAuthzDataSchema = z.object({
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

export type RawAuthzData = Omit<z.infer<typeof RawAuthzDataSchema>, 'user' | 'authn_user'> & {
  user: RawStaffUser;
  authn_user: RawStaffUser;
};
const AuthzDataSchema = RawAuthzDataSchema.brand<'AuthzData'>();
export type AuthzData = z.infer<typeof AuthzDataSchema>;

export const RawPageContextSchema = z.object({
  __csrf_token: z.string(),
  urlPrefix: z.string(),
  plainUrlPrefix: z.string(),

  // authn data
  authn_user: StaffUserSchema,
  authn_institution: StaffInstitutionSchema,
  authn_provider_name: z.string(),
  authn_is_administrator: SelectUserSchema.shape.is_administrator,
  access_as_administrator: z.boolean(),
  is_administrator: z.boolean(),
  is_institution_administrator: z.boolean(),
  news_item_notification_count: SelectUserSchema.shape.news_item_notification_count,

  navPage: NavPageSchema,
  /** You should prefer to set the navbarType instead of using this value. */
  navbarType: NavbarTypeSchema,
});
export const PageContextSchema = RawPageContextSchema.brand<'PageContext'>();
export type PageContext = z.infer<typeof PageContextSchema>;

export const RawPageContextWithAuthzDataSchema = RawPageContextSchema.extend({
  authz_data: AuthzDataSchema,
});
export const PageContextWithAuthzDataSchema =
  RawPageContextWithAuthzDataSchema.brand<'PageContextWithAuthzData'>();
export type PageContextWithAuthzData = z.infer<typeof PageContextWithAuthzDataSchema>;

export function getPageContext(
  resLocals: Record<string, any>,
  options?: {
    withAuthzData?: true;
  },
): PageContextWithAuthzData;

export function getPageContext(
  resLocals: Record<string, any>,
  options: {
    withAuthzData: false;
  },
): PageContext;

export function getPageContext(
  resLocals: Record<string, any>,
  {
    withAuthzData = true,
  }: {
    withAuthzData?: boolean;
  } = {},
): PageContext | PageContextWithAuthzData {
  const schema = withAuthzData ? PageContextWithAuthzDataSchema : PageContextSchema;
  return schema.parse(resLocals);
}

// Since this data comes from res.locals and not the database, we can make certain guarantees
// about the data. Specifically, `short_name` will never be null for non-deleted courses
// and course instances.

// If '*CourseInstanceSchema' ever differs at a column level
// from '*CourseInstanceContext.course_instance' our branding strategy needs to be updated.

const RawStudentCourseInstanceContextSchema = z.object({
  course_instance: z
    .object({
      ...RawStudentCourseInstanceSchema.shape,
      short_name: z.string(),
    })
    .brand('StudentCourseInstance'),
  course: z
    .object({
      ...RawStudentCourseSchema.shape,
      short_name: z.string(),
    })
    .brand('StudentCourse'),
  has_enhanced_navigation: z.boolean(),
});
export const StudentCourseInstanceContextSchema =
  RawStudentCourseInstanceContextSchema.brand<'StudentCourseInstanceContext'>();

export type StudentCourseInstanceContext = z.infer<typeof StudentCourseInstanceContextSchema>;

const RawStaffCourseInstanceContextSchema = z.object({
  course_instance: z
    .object({
      ...RawStaffCourseInstanceSchema.shape,
      short_name: z.string(),
    })
    .brand('StaffCourseInstance'),
  course: z
    .object({
      ...RawStaffCourseSchema.shape,
      short_name: z.string(),
    })
    .brand('StaffCourse'),
  institution: StaffInstitutionSchema,
  has_enhanced_navigation: z.boolean(),
});
export const StaffCourseInstanceContextSchema =
  RawStaffCourseInstanceContextSchema.brand<'StaffCourseInstanceContext'>();

export type StaffCourseInstanceContext = z.infer<typeof StaffCourseInstanceContextSchema>;

export function getCourseInstanceContext(
  resLocals: Record<string, any>,
  pageType: 'student',
): StudentCourseInstanceContext;

export function getCourseInstanceContext(
  resLocals: Record<string, any>,
  pageType: 'instructor',
): StaffCourseInstanceContext;

export function getCourseInstanceContext(
  resLocals: Record<string, any>,
  pageType: 'student' | 'instructor',
): StudentCourseInstanceContext | StaffCourseInstanceContext {
  const schema = run(() => {
    if (pageType === 'student') {
      return StudentCourseInstanceContextSchema;
    }
    return StaffCourseInstanceContextSchema;
  });
  return schema.parse(resLocals);
}

const RawStaffAssessmentContextSchema = z.object({
  assessment: RawStaffAssessmentSchema.extend({
    type: z.enum(['Exam', 'Homework']),
  }),
  assessment_set: RawStaffAssessmentSetSchema,
});
const StaffAssessmentContextSchema =
  RawStaffAssessmentContextSchema.brand<'StaffAssessmentContext'>();

export type StaffAssessmentContext = z.infer<typeof StaffAssessmentContextSchema>;

export function getAssessmentContext(resLocals: Record<string, any>): StaffAssessmentContext {
  const schema = StaffAssessmentContextSchema;
  return schema.parse(resLocals);
}

export interface DangerousSystemAuthzData {
  authn_user: {
    user_id: null;
  };
  user: {
    user_id: null;
  };
}

export function dangerousFullAuthzAsSystem(): DangerousSystemAuthzData {
  return {
    authn_user: {
      user_id: null,
    },
    user: {
      user_id: null,
    },
  };
}
