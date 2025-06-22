import { z } from 'zod';

import {
  type InstructorCourse,
  type InstructorCourseInstance,
  InstructorCourseInstanceSchema,
  InstructorCourseSchema,
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

/**
 * Parses and validates resLocals data, stripping any fields that aren't in the schema.
 * @param data - The raw data to parse
 * @returns Parsed and validated ResLocals object
 */
export function getPageContext(data: Record<string, any>): PageContext {
  return PageContext.parse(data);
}

interface StudentCourseInstanceContext {
  course_instance: StudentCourseInstance;
  course: StudentCourse;
}

interface InstructorCourseInstanceContext {
  course_instance: InstructorCourseInstance;
  course: InstructorCourse;
}

export function getCourseInstanceContext(
  data: Record<string, any>,
  authLevel: 'student',
): StudentCourseInstanceContext;

export function getCourseInstanceContext(
  data: Record<string, any>,
  authLevel: 'instructor',
): InstructorCourseInstanceContext;

export function getCourseInstanceContext(
  data: Record<string, any>,
  authLevel: 'student' | 'instructor',
): StudentCourseInstanceContext | InstructorCourseInstanceContext {
  if (authLevel === 'student') {
    return {
      course_instance: StudentCourseInstanceSchema.parse(data.course_instance),
      course: StudentCourseSchema.parse(data.course),
    };
  }
  return {
    course_instance: InstructorCourseInstanceSchema.parse(data.course_instance),
    course: InstructorCourseSchema.parse(data.course),
  };
}
