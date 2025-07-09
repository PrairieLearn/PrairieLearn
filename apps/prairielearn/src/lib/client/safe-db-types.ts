import { type z } from 'zod';

import {
  AssessmentInstanceSchema as RawAssessmentInstanceSchema,
  AssessmentSchema as RawAssessmentSchema,
  AssessmentSetSchema as RawAssessmentSetSchema,
  CourseInstanceSchema as RawCourseInstanceSchema,
  CourseSchema as RawCourseSchema,
  UserSchema as RawUserSchema,
} from '../db-types.js';

/** Assessments */
export const RawStaffAssessmentSchema = RawAssessmentSchema;
export const StaffAssessmentSchema = RawStaffAssessmentSchema.brand<'StaffAssessment'>();
export type StaffAssessment = z.infer<typeof StaffAssessmentSchema>;

export const RawStudentAssessmentSchema = RawStaffAssessmentSchema.pick({
  advance_score_perc: true,
  allow_issue_reporting: true,
  allow_real_time_grading: true,
  allow_personal_notes: true,
  assessment_module_id: true,
  assessment_set_id: true,
  auto_close: true,
  constant_question_value: true,
  course_instance_id: true,
  deleted_at: true,
  group_work: true,
  honor_code: true,
  id: true,
  max_bonus_points: true,
  max_points: true,
  multiple_instance: true,
  number: true,
  require_honor_code: true,
  shuffle_questions: true,
  text: true,
  tid: true,
  title: true,
  type: true,
});
export const StudentAssessmentSchema = RawStudentAssessmentSchema.brand<'StudentAssessment'>();
export type StudentAssessment = z.infer<typeof StudentAssessmentSchema>;

/** Assessment Instances */

export const RawStaffAssessmentInstanceSchema = RawAssessmentInstanceSchema;
export const StaffAssessmentInstanceSchema =
  RawStaffAssessmentInstanceSchema.brand<'StaffAssessmentInstance'>();
export type StaffAssessmentInstance = z.infer<typeof StaffAssessmentInstanceSchema>;

export const RawStudentAssessmentInstanceSchema = RawStaffAssessmentInstanceSchema.pick({
  assessment_id: true,
  auth_user_id: true,
  auto_close: true,
  closed_at: true,
  date: true,
  date_limit: true,
  duration: true,
  grading_needed: true,
  group_id: true,
  id: true,
  max_bonus_points: true,
  max_points: true,
  mode: true,
  modified_at: true,
  number: true,
  open: true,
  points: true,
  score_perc: true,
  user_id: true,
});
export const StudentAssessmentInstanceSchema =
  RawStudentAssessmentInstanceSchema.brand<'StudentAssessmentInstance'>();
export type StudentAssessmentInstance = z.infer<typeof StudentAssessmentInstanceSchema>;

/** Assessment Sets */

export const RawStaffAssessmentSetSchema = RawAssessmentSetSchema;
export const StaffAssessmentSetSchema = RawStaffAssessmentSetSchema.brand<'StaffAssessmentSet'>();
export type StaffAssessmentSet = z.infer<typeof StaffAssessmentSetSchema>;

export const RawStudentAssessmentSetSchema = RawStaffAssessmentSetSchema.pick({
  abbreviation: true,
  color: true,
  course_id: true,
  heading: true,
  id: true,
  implicit: true,
  name: true,
  number: true,
});
export const StudentAssessmentSetSchema =
  RawStudentAssessmentSetSchema.brand<'StudentAssessmentSet'>();
export type StudentAssessmentSet = z.infer<typeof StudentAssessmentSetSchema>;

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
