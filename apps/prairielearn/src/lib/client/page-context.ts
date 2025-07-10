import { z } from 'zod';

import {
  RawStaffCourseInstanceSchema,
  RawStaffCourseSchema,
  RawStudentCourseInstanceSchema,
  RawStudentCourseSchema,
} from './safe-db-types.js';

const PageContext = z.object({
  authz_data: z.object({
    has_course_instance_permission_edit: z.boolean(),
    has_course_instance_permission_view: z.boolean(),
    has_course_permission_own: z.boolean(),
    user: z.object({
      name: z.string(),
      uid: z.string(),
    }),
    mode: z.string().nullable(),
  }),

  urlPrefix: z.string(),
  access_as_administrator: z.boolean(),
  authn_is_administrator: z.boolean(),
  authn_user: z.object({
    name: z.string(),
    uid: z.string(),
  }),
});
export type PageContext = z.infer<typeof PageContext>;

export function getPageContext(resLocals: Record<string, any>): PageContext {
  return PageContext.parse(resLocals);
}

// Since this data comes from res.locals and not the database, we can make certain guarantees
// about the data. Specifically, `short_name` will never be null for non-deleted courses
// and course instances.

const RawStudentCourseInstanceContextSchema = z.object({
  course_instance: z.object({
    ...RawStudentCourseInstanceSchema.shape,
    short_name: z.string(),
  }),
  course: z.object({
    ...RawStudentCourseSchema.shape,
    short_name: z.string(),
  }),
});
export const StudentCourseInstanceContextSchema =
  RawStudentCourseInstanceContextSchema.brand<'StudentCourseInstanceContext'>();

export type StudentCourseInstanceContext = z.infer<typeof StudentCourseInstanceContextSchema>;

const RawStaffCourseInstanceContextSchema = z.object({
  course_instance: z.object({
    ...RawStaffCourseInstanceSchema.shape,
    short_name: z.string(),
  }),
  course: z.object({
    ...RawStaffCourseSchema.shape,
    short_name: z.string(),
  }),
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
