import type z from 'zod';

import {
  AssessmentQuestionSchema,
  CourseInstanceSchema,
  CourseSchema,
  UserSchema,
} from '../db-types.js';

export const StaffCourseSchema = CourseSchema.omit({
  yearly_enrollment_limit: true,
  sharing_token: true,
});
export type StaffCourse = z.infer<typeof StaffCourseSchema>;

export const StudentCourseSchema = StaffCourseSchema.omit({
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
export type StudentCourse = z.infer<typeof StudentCourseSchema>;

export const StaffCourseInstanceSchema = CourseInstanceSchema;
export type StaffCourseInstance = z.infer<typeof StaffCourseInstanceSchema>;

export const StudentCourseInstanceSchema = StaffCourseInstanceSchema.omit({
  enrollment_limit: true,
  json_comment: true,
  share_source_publicly: true,
  sync_errors: true,
  sync_job_sequence_id: true,
  sync_warnings: true,
  uuid: true,
});
export type StudentCourseInstance = z.infer<typeof StudentCourseInstanceSchema>;

export const StaffUserSchema = UserSchema.omit({
  deleted_at: true,
  lti_context_id: true,
  lti_course_instance_id: true,
  lti_user_id: true,
  stripe_customer_id: true,
  terms_accepted_at: true,
});
export type StaffUser = z.infer<typeof StaffUserSchema>;

export const StudentUserSchema = StaffUserSchema.omit({ email: true, uin: true });
export type StudentUser = z.infer<typeof StudentUserSchema>;

// While there are not currently any changes to the structure between StaffAssessmentQuestionSchema
// and AssessmentQuestionSchema, we are maintaining consistency with our naming conventions
// for safe types.
export const StaffAssessmentQuestionSchema = AssessmentQuestionSchema;
