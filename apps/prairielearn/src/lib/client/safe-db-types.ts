import type z from 'zod';

import { CourseInstanceSchema, CourseSchema, UserSchema } from '../db-types.js';

export const StaffCourseSchema = CourseSchema.omit({
  yearly_enrollment_limit: true,
});
export type StaffCourse = z.infer<typeof StaffCourseSchema>;

export const StudentCourseSchema = StaffCourseSchema.omit({
  branch: true,
  commit_hash: true,
  json_comment: true,
  path: true,
  repository: true,
  sharing_name: true,
  sharing_token: true,
  show_getting_started: true,
  sync_errors: true,
  sync_job_sequence_id: true,
  sync_warnings: true,
});
export type StudentCourse = z.infer<typeof StudentCourseSchema>;

export const StaffCourseInstanceSchema = CourseInstanceSchema;
export type StaffCourseInstance = z.infer<typeof StaffCourseInstanceSchema>;

export const StudentCourseInstanceSchema = StaffCourseInstanceSchema.omit({
  enrollment_limit: true,
  sync_errors: true,
  sync_job_sequence_id: true,
  sync_warnings: true,
});
export type StudentCourseInstance = z.infer<typeof StudentCourseInstanceSchema>;

export const StaffUserSchema = UserSchema.omit({ stripe_customer_id: true });
export type StaffUser = z.infer<typeof StaffUserSchema>;

export const StudentUserSchema = StaffUserSchema.omit({ uin: true });
export type StudentUser = z.infer<typeof StudentUserSchema>;
