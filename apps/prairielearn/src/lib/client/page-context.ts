import { z } from 'zod';

import { NavbarTypeSchema } from '../../components/Navbar.types.js';

import {
  RawStaffCourseInstanceSchema,
  RawStaffCourseSchema,
  RawStudentCourseInstanceSchema,
  RawStudentCourseSchema,
  StaffUserSchema,
} from './safe-db-types.js';

const RawPageContextSchema = z.object({
  authz_data: z.object({
    // TODO: Type these more accurately into a course instance version.
    authn_is_administrator: z.boolean(),
    authn_has_course_permission_preview: z.boolean().optional(),
    authn_has_course_permission_view: z.boolean().optional(),
    authn_has_course_permission_edit: z.boolean().optional(),
    authn_has_course_permission_own: z.boolean().optional(),
    authn_course_role: z.string().optional(),
    authn_course_instance_role: z.string().optional(),
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
    course_role: z.string().optional(),
    course_instance_role: z.string().optional(),
    mode: z.string().optional(),
    has_student_access: z.boolean().optional(),
    has_student_access_with_enrollment: z.boolean().optional(),
    has_course_instance_permission_view: z.boolean().optional(),
    has_course_instance_permission_edit: z.boolean().optional(),

    user: StaffUserSchema,
  }),

  urlPrefix: z.string(),
  access_as_administrator: z.boolean(),

  authn_user: StaffUserSchema,
  /** You should prefer to set the navbarType instead of using this value. */
  navbarType: NavbarTypeSchema,
});
export const PageContextSchema = RawPageContextSchema.brand<'PageContext'>();
export type PageContext = z.infer<typeof PageContextSchema>;

export function getPageContext(resLocals: Record<string, any>): PageContext {
  return PageContextSchema.parse(resLocals);
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
});
export const StaffCourseInstanceContextSchema =
  RawStaffCourseInstanceContextSchema.brand<'StaffCourseInstanceContext'>();

export type StaffCourseInstanceContext = z.infer<typeof StaffCourseInstanceContextSchema>;

export function getCourseInstanceContext(
  resLocals: Record<string, any>,
  authLevel: 'student',
): StudentCourseInstanceContext;

export function getCourseInstanceContext(
  resLocals: Record<string, any>,
  authLevel: 'instructor',
): StaffCourseInstanceContext;

export function getCourseInstanceContext(
  resLocals: Record<string, any>,
  authLevel: 'student' | 'instructor',
): StudentCourseInstanceContext | StaffCourseInstanceContext {
  if (authLevel === 'student') {
    return StudentCourseInstanceContextSchema.parse(resLocals);
  }
  return StaffCourseInstanceContextSchema.parse(resLocals);
}
