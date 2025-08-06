import { type z } from 'zod';

import {
  AlternativeGroupSchema as RawAlternativeGroupSchema,
  AssessmentInstanceSchema as RawAssessmentInstanceSchema,
  AssessmentQuestionSchema as RawAssessmentQuestionSchema,
  AssessmentSchema as RawAssessmentSchema,
  AssessmentSetSchema as RawAssessmentSetSchema,
  CourseInstanceSchema as RawCourseInstanceSchema,
  CourseSchema as RawCourseSchema,
  EnrollmentSchema as RawEnrollmentSchema,
  QuestionSchema as RawQuestionSchema,
  TagSchema as RawTagSchema,
  TopicSchema as RawTopicSchema,
  UserSchema as RawUserSchema,
  ZoneSchema as RawZoneSchema,
} from '../db-types.js';

/** Alternative Groups */
export const StaffAlternativeGroupSchema =
  RawAlternativeGroupSchema.brand<'StaffAlternativeGroup'>();
export type StaffAlternativeGroup = z.infer<typeof StaffAlternativeGroupSchema>;

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

export const RawStudentAssessmentInstanceSchema__UNSAFE = RawStaffAssessmentInstanceSchema.pick({
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
  // '__UNSAFE' indicates that this schema needs further transformations before being sent to the client.
  points: true, // potentially sensitive
  score_perc: true, // potentially sensitive
  user_id: true,
});
export const StudentAssessmentInstanceSchema__UNSAFE =
  RawStudentAssessmentInstanceSchema__UNSAFE.brand<'StudentAssessmentInstance'>();
export type StudentAssessmentInstance__UNSAFE = z.infer<
  typeof StudentAssessmentInstanceSchema__UNSAFE
>;

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

/** Assessment Questions */

export const StaffAssessmentQuestionSchema =
  RawAssessmentQuestionSchema.brand<'StaffAssessmentQuestion'>();
export type StaffAssessmentQuestion = z.infer<typeof StaffAssessmentQuestionSchema>;

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

/** Enrollments */
export const RawStaffEnrollmentSchema = RawEnrollmentSchema;
export const StaffEnrollmentSchema = RawStaffEnrollmentSchema.brand<'StaffEnrollment'>();
export type StaffEnrollment = z.infer<typeof StaffEnrollmentSchema>;

/** Questions */
export const StaffQuestionSchema = RawQuestionSchema.brand<'StaffQuestion'>();
export type StaffQuestion = z.infer<typeof StaffQuestionSchema>;

/** Topics */
export const StaffTopicSchema = RawTopicSchema.brand<'StaffTopic'>();
export type StaffTopic = z.infer<typeof StaffTopicSchema>;

/** Tags */
export const StaffTagSchema = RawTagSchema.brand<'StaffTag'>();
export type StaffTag = z.infer<typeof StaffTagSchema>;

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

/** Zones */
export const StaffZoneSchema = RawZoneSchema.brand<'StaffZone'>();
export type StaffZone = z.infer<typeof StaffZoneSchema>;
