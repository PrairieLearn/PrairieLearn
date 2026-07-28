import { z } from 'zod';

import { DateFromISOString } from '@prairielearn/zod';

import {
  RawStudentCourseInstanceSchema,
  RawStudentCourseSchema,
} from '../../lib/client/safe-db-types.js';
import { CourseInstancePublishingExtensionSchema, EnrollmentSchema } from '../../lib/db-types.js';

export const InstructorHomePageCourseSchema = z.object({
  id: RawStudentCourseSchema.shape.id,
  short_name: RawStudentCourseSchema.shape.short_name,
  title: RawStudentCourseSchema.shape.title,
  can_open_course: z.boolean(),
  course_instances: z.array(
    z.object({
      id: RawStudentCourseSchema.shape.id,
      long_name: RawStudentCourseInstanceSchema.shape.long_name,
      expired: z.boolean(),
    }),
  ),
});
export type InstructorHomePageCourse = z.infer<typeof InstructorHomePageCourseSchema>;

export const StudentHomePageCourseDataSchema = z.object({
  course_id: RawStudentCourseSchema.shape.id,
  course_instance: RawStudentCourseInstanceSchema,
  course_short_name: RawStudentCourseSchema.shape.short_name,
  course_title: RawStudentCourseSchema.shape.title,
  start_date: DateFromISOString.nullable(),
  end_date: DateFromISOString.nullable(),
  latest_publishing_extension: CourseInstancePublishingExtensionSchema.nullable(),
});
export type StudentHomePageCourseData = z.infer<typeof StudentHomePageCourseDataSchema>;

export const StudentHomePageCourseCandidateRowSchema = StudentHomePageCourseDataSchema.extend({
  enrollment: EnrollmentSchema,
  matches_bound_user: z.boolean(),
  matches_institution_uin: z.boolean(),
  matches_lti13: z.boolean(),
  matches_pending_uid: z.boolean(),
});
export type StudentHomePageCourseCandidateRow = z.infer<
  typeof StudentHomePageCourseCandidateRowSchema
>;

export type StudentHomePageCourse = StudentHomePageCourseData &
  (
    | { access_type: 'joined' }
    | { access_type: 'conventional_invitation'; invitation_enrollment_id: string }
    | { access_type: 'roster_available' }
  );
