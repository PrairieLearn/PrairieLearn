import { z } from 'zod';

import {
  type StaffCourse,
  type StaffCourseInstance,
  StaffCourseInstanceSchema,
  StaffCourseSchema,
  type StudentCourse,
  type StudentCourseInstance,
  StudentCourseInstanceSchema,
  StudentCourseSchema,
} from '../db-types.js';

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
  news_item_notification_count: z.number(),
  authn_is_administrator: z.boolean(),
  authn_user: z.object({
    name: z.string(),
    uid: z.string(),
  }),
  viewType: z.enum(['instructor', 'student']),
});
export type PageContext = z.infer<typeof PageContext>;

export function getPageContext(data: Record<string, any>): PageContext {
  return PageContext.parse(data);
}

export interface StudentCourseInstanceContext {
  course_instance: StudentCourseInstance;
  course: StudentCourse;
}

export interface StaffCourseInstanceContext {
  course_instance: StaffCourseInstance;
  course: StaffCourse;
}

export function getCourseInstanceContext(
  data: Record<string, any>,
  authLevel: 'student',
): StudentCourseInstanceContext;

export function getCourseInstanceContext(
  data: Record<string, any>,
  authLevel: 'instructor',
): StaffCourseInstanceContext;

export function getCourseInstanceContext(
  data: Record<string, any>,
  authLevel: 'student' | 'instructor',
): StudentCourseInstanceContext | StaffCourseInstanceContext {
  if (authLevel === 'student') {
    return {
      course_instance: StudentCourseInstanceSchema.parse(data.course_instance),
      course: StudentCourseSchema.parse(data.course),
    };
  }
  return {
    course_instance: StaffCourseInstanceSchema.parse(data.course_instance),
    course: StaffCourseSchema.parse(data.course),
  };
}
