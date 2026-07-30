import { z } from 'zod';

import { DateFromISOString } from '@prairielearn/zod';

import {
  RawStudentCourseInstanceSchema,
  RawStudentCourseSchema,
  StudentEnrollmentSchema,
} from '../../lib/client/safe-db-types.js';
import { CourseInstancePublishingExtensionSchema } from '../../lib/db-types.js';

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

export const StudentHomePageCourseSchema = z.object({
  course_id: RawStudentCourseSchema.shape.id,
  course_instance: RawStudentCourseInstanceSchema,
  course_short_name: RawStudentCourseSchema.shape.short_name,
  course_title: RawStudentCourseSchema.shape.title,
  enrollment: StudentEnrollmentSchema,
  start_date: DateFromISOString.nullable(),
  end_date: DateFromISOString.nullable(),
  latest_publishing_extension: CourseInstancePublishingExtensionSchema.nullable(),
});
export type StudentHomePageCourse = z.infer<typeof StudentHomePageCourseSchema>;
