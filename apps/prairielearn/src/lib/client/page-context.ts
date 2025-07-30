import { z } from 'zod';

import { run } from '@prairielearn/run';

import {
  RawStaffAssessmentSchema,
  RawStaffAssessmentSetSchema,
  RawStaffCourseInstanceSchema,
  RawStaffCourseSchema,
  RawStudentCourseInstanceSchema,
  RawStudentCourseSchema,
} from './safe-db-types.js';

const RawPageContextSchema = z.object({
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
  const schema = run(() => {
    if (authLevel === 'student') {
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
