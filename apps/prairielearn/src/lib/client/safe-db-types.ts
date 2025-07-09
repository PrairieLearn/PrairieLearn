import { type z } from 'zod';

import {
  CourseInstanceSchema as RawCourseInstanceSchema,
  CourseSchema as RawCourseSchema,
  UserSchema as RawUserSchema,
} from '../db-types.js';

/** Courses */

export const RawStaffCourseSchema = RawCourseSchema.pick({
  announcement_color: true,
  announcement_html: true,
  branch: true,
  commit_hash: true,
  course_instance_enrollment_limit: true,
  created_at: true,
  deleted_at: true,
  display_timezone: true,
  example_course: true,
  id: true,
  institution_id: true,
  json_comment: true,
  options: true,
  path: true,
  repository: true,
  sharing_name: true,
  short_name: true,
  show_getting_started: true,
  sync_errors: true,
  sync_job_sequence_id: true,
  sync_warnings: true,
  template_course: true,
  title: true,
});
export const StaffCourseSchema = RawStaffCourseSchema.brand<'StaffCourse'>();
export type StaffCourse = z.infer<typeof StaffCourseSchema>;

export const RawStudentCourseSchema = RawStaffCourseSchema.pick({
  created_at: true,
  deleted_at: true,
  display_timezone: true,
  example_course: true,
  id: true,
  institution_id: true,
  options: true,
  short_name: true,
  template_course: true,
  title: true,
});
export const StudentCourseSchema = RawStudentCourseSchema.brand<'StudentCourse'>();
export type StudentCourse = z.infer<typeof StudentCourseSchema>;

/** Course Instances */

export const RawStaffCourseInstanceSchema = RawCourseInstanceSchema;
export const StaffCourseInstanceSchema =
  RawStaffCourseInstanceSchema.brand<'StaffCourseInstance'>();
export type StaffCourseInstance = z.infer<typeof StaffCourseInstanceSchema>;

export const RawStudentCourseInstanceSchema = RawStaffCourseInstanceSchema.pick({
  assessments_group_by: true,
  course_id: true,
  deleted_at: true,
  display_timezone: true,
  hide_in_enroll_page: true,
  id: true,
  long_name: true,
  short_name: true,
});
export const StudentCourseInstanceSchema =
  RawStudentCourseInstanceSchema.brand<'StudentCourseInstance'>();
export type StudentCourseInstance = z.infer<typeof StudentCourseInstanceSchema>;

/** Users */

const RawStaffUserSchema = RawUserSchema.pick({
  email: true,
  institution_id: true,
  name: true,
  uid: true,
  uin: true,
  user_id: true,
});
export const StaffUserSchema = RawStaffUserSchema.brand<'StaffUser'>();
export type StaffUser = z.infer<typeof StaffUserSchema>;

const RawStudentUserSchema = RawStaffUserSchema.pick({
  institution_id: true,
  name: true,
  uid: true,
  user_id: true,
});
export const StudentUserSchema = RawStudentUserSchema.brand<'StudentUser'>();
export type StudentUser = z.infer<typeof StudentUserSchema>;
