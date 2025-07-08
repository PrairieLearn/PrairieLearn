import { type z } from 'zod';

import {
  CourseInstanceSchema as RawCourseInstanceSchema,
  CourseSchema as RawCourseSchema,
  UserSchema as RawUserSchema,
} from '../db-types.js';

/** Courses */

export const RawStaffCourseSchema = RawCourseSchema.omit({
  yearly_enrollment_limit: true,
  sharing_token: true,
});
export const StaffCourseSchema = RawStaffCourseSchema.brand<'StaffCourse'>();
export type StaffCourse = z.infer<typeof StaffCourseSchema>;

export const RawStudentCourseSchema = RawStaffCourseSchema.omit({
  announcement_color: true,
  announcement_html: true,
  branch: true,
  commit_hash: true,
  course_instance_enrollment_limit: true,
  json_comment: true,
  path: true,
  repository: true,
  sharing_name: true,
  show_getting_started: true,
  sync_errors: true,
  sync_job_sequence_id: true,
  sync_warnings: true,
});
export const StudentCourseSchema = RawStudentCourseSchema.brand<'StudentCourse'>();
export type StudentCourse = z.infer<typeof StudentCourseSchema>;

/** Course Instances */

export const RawStaffCourseInstanceSchema = RawCourseInstanceSchema;
export const StaffCourseInstanceSchema =
  RawStaffCourseInstanceSchema.brand<'StaffCourseInstance'>();
export type StaffCourseInstance = z.infer<typeof StaffCourseInstanceSchema>;

export const RawStudentCourseInstanceSchema = RawStaffCourseInstanceSchema.omit({
  enrollment_limit: true,
  json_comment: true,
  share_source_publicly: true,
  sync_errors: true,
  sync_job_sequence_id: true,
  sync_warnings: true,
  uuid: true,
});
export const StudentCourseInstanceSchema =
  RawStudentCourseInstanceSchema.brand<'StudentCourseInstance'>();
export type StudentCourseInstance = z.infer<typeof StudentCourseInstanceSchema>;

/** Users */

const RawStaffUserSchema = RawUserSchema.omit({
  deleted_at: true,
  lti_context_id: true,
  lti_course_instance_id: true,
  lti_user_id: true,
  stripe_customer_id: true,
  terms_accepted_at: true,
});
export const StaffUserSchema = RawStaffUserSchema.brand<'StaffUser'>();
export type StaffUser = z.infer<typeof StaffUserSchema>;

const RawStudentUserSchema = RawStaffUserSchema.omit({ email: true, uin: true });
export const StudentUserSchema = RawStudentUserSchema.brand<'StudentUser'>();
export type StudentUser = z.infer<typeof StudentUserSchema>;
