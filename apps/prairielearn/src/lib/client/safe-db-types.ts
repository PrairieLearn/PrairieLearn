/* eslint perfectionist/sort-objects: error */

/**
 * These schemas are used on any client page that needs to display data from the database. They are a more
 * strict version of the db-types.ts schemas.
 *
 * The schemas are grouped into the following categories, and get progressively more strict:
 *
 * - Admin*Schema
 * - Staff*Schema
 * - Student*Schema
 * - Public*Schema
 *
 * The `Raw` prefix indicates that the schema is unbranded. In almost all scenarios,
 * you should use the branded schema for type safety.
 */

import { type z } from 'zod';

import {
  AlternativeGroupSchema as RawAlternativeGroupSchema,
  AssessmentInstanceSchema as RawAssessmentInstanceSchema,
  AssessmentModuleSchema as RawAssessmentModuleSchema,
  AssessmentQuestionSchema as RawAssessmentQuestionSchema,
  AssessmentSchema as RawAssessmentSchema,
  AssessmentSetSchema as RawAssessmentSetSchema,
  AuditEventSchema as RawAuditEventSchema,
  AuthnProviderSchema as RawAuthnProviderSchema,
  CourseInstanceSchema as RawCourseInstanceSchema,
  CourseSchema as RawCourseSchema,
  EnrollmentSchema as RawEnrollmentSchema,
  InstanceQuestionGroupSchema as RawInstanceQuestionGroupSchema,
  InstanceQuestionSchema as RawInstanceQuestionSchema,
  InstitutionSchema as RawInstitutionSchema,
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

export const RawPublicAssessmentSchema = RawStudentAssessmentSchema.pick({
  id: true,
  tid: true,
  title: true,
  type: true,
});
export const PublicAssessmentSchema = RawPublicAssessmentSchema.brand<'PublicAssessment'>();
export type PublicAssessment = z.infer<typeof PublicAssessmentSchema>;

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

/** Assessment Modules */

export const RawStaffAssessmentModuleSchema = RawAssessmentModuleSchema;
export const StaffAssessmentModuleSchema =
  RawStaffAssessmentModuleSchema.brand<'StaffAssessmentModule'>();
export type StaffAssessmentModule = z.infer<typeof StaffAssessmentModuleSchema>;

export const RawPublicAssessmentModuleSchema = RawStaffAssessmentModuleSchema.pick({
  heading: true,
  id: true,
  implicit: true,
  name: true,
});
export const PublicAssessmentModuleSchema =
  RawPublicAssessmentModuleSchema.brand<'PublicAssessmentModule'>();
export type PublicAssessmentModule = z.infer<typeof PublicAssessmentModuleSchema>;

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

export const RawPublicAssessmentSetSchema = RawStudentAssessmentSetSchema;
export const PublicAssessmentSetSchema =
  RawPublicAssessmentSetSchema.brand<'PublicAssessmentSet'>();
export type PublicAssessmentSet = z.infer<typeof PublicAssessmentSetSchema>;

/** Assessment Questions */
export const RawStaffAssessmentQuestionSchema = RawAssessmentQuestionSchema;
export const StaffAssessmentQuestionSchema =
  RawStaffAssessmentQuestionSchema.brand<'StaffAssessmentQuestion'>();
export type StaffAssessmentQuestion = z.infer<typeof StaffAssessmentQuestionSchema>;

/** Audit Events */
export const StaffAuditEventSchema = RawAuditEventSchema.brand<'StaffAuditEvent'>();
export type StaffAuditEvent = z.infer<typeof StaffAuditEventSchema>;

/** Courses */
export const RawAdminCourseSchema = RawCourseSchema;
export const AdminCourseSchema = RawAdminCourseSchema.brand<'AdminCourse'>();
export type AdminCourse = z.infer<typeof AdminCourseSchema>;

export const RawStaffCourseSchema = RawAdminCourseSchema.pick({
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

export const RawPublicCourseSchema = RawStaffCourseSchema.pick({
  id: true,
  sharing_name: true,
  short_name: true,
  title: true,
});
export const PublicCourseSchema = RawPublicCourseSchema.brand<'PublicCourse'>();
export type PublicCourse = z.infer<typeof PublicCourseSchema>;

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
export const RawAdminCourseInstanceSchema = RawCourseInstanceSchema;
export const AdminCourseInstanceSchema =
  RawAdminCourseInstanceSchema.brand<'AdminCourseInstance'>();
export type AdminCourseInstance = z.infer<typeof AdminCourseInstanceSchema>;

export const RawStaffCourseInstanceSchema = RawAdminCourseInstanceSchema;
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
  publishing_end_date: true,
  publishing_start_date: true,
  short_name: true,
});
export const StudentCourseInstanceSchema =
  RawStudentCourseInstanceSchema.brand<'StudentCourseInstance'>();
export type StudentCourseInstance = z.infer<typeof StudentCourseInstanceSchema>;

export const RawPublicCourseInstanceSchema = RawStudentCourseInstanceSchema.pick({
  assessments_group_by: true,
  display_timezone: true,
  id: true,
  long_name: true,
  short_name: true,
});
export const PublicCourseInstanceSchema =
  RawPublicCourseInstanceSchema.brand<'PublicCourseInstance'>();
export type PublicCourseInstance = z.infer<typeof PublicCourseInstanceSchema>;

/** Enrollments */
export const RawStaffEnrollmentSchema = RawEnrollmentSchema.pick({
  course_instance_id: true,
  created_at: true,
  first_joined_at: true,
  id: true,
  lti_managed: true,
  pending_lti13_email: true,
  pending_lti13_instance_id: true,
  pending_lti13_name: true,
  pending_lti13_sub: true,
  pending_uid: true,
  status: true,
  user_id: true,
});
export const StaffEnrollmentSchema = RawStaffEnrollmentSchema.brand<'StaffEnrollment'>();
export type StaffEnrollment = z.infer<typeof StaffEnrollmentSchema>;

export const RawStudentEnrollmentSchema = RawStaffEnrollmentSchema.pick({
  course_instance_id: true,
  created_at: true,
  first_joined_at: true,
  id: true,
  lti_managed: true,
  pending_uid: true,
  status: true,
  user_id: true,
});
export const StudentEnrollmentSchema = RawStudentEnrollmentSchema.brand<'StudentEnrollment'>();
export type StudentEnrollment = z.infer<typeof StudentEnrollmentSchema>;

/** Instance Question Groups */
export const RawStaffInstanceQuestionGroupSchema = RawInstanceQuestionGroupSchema;
export const StaffInstanceQuestionGroupSchema =
  RawStaffInstanceQuestionGroupSchema.brand<'StaffInstanceQuestionGroup'>();
export type StaffInstanceQuestionGroup = z.infer<typeof StaffInstanceQuestionGroupSchema>;

/** Instance Questions */
export const RawStaffInstanceQuestionSchema = RawInstanceQuestionSchema;
export const StaffInstanceQuestionSchema =
  RawStaffInstanceQuestionSchema.brand<'StaffInstanceQuestion'>();
export type StaffInstanceQuestion = z.infer<typeof StaffInstanceQuestionSchema>;

/** Institutions */
export const RawAdminInstitutionSchema = RawInstitutionSchema.pick({
  course_instance_enrollment_limit: true,
  default_authn_provider_id: true,
  display_timezone: true,
  id: true,
  long_name: true,
  short_name: true,
  uid_regexp: true,
  yearly_enrollment_limit: true,
});
export const AdminInstitutionSchema = RawAdminInstitutionSchema.brand<'AdminInstitution'>();
export type AdminInstitution = z.infer<typeof AdminInstitutionSchema>;

export const RawStaffInstitutionSchema = RawInstitutionSchema.pick({
  default_authn_provider_id: true,
  display_timezone: true,
  id: true,
  long_name: true,
  short_name: true,
});
export const StaffInstitutionSchema = RawStaffInstitutionSchema.brand<'StaffInstitution'>();
export type StaffInstitution = z.infer<typeof StaffInstitutionSchema>;

/** AuthnProviders */
export const RawStaffAuthnProviderSchema = RawAuthnProviderSchema.pick({
  id: true,
  name: true,
});
export const StaffAuthnProviderSchema = RawStaffAuthnProviderSchema.brand<'StaffAuthnProvider'>();
export type StaffAuthnProvider = z.infer<typeof StaffAuthnProviderSchema>;

/** Questions */
export const RawStaffQuestionSchema = RawQuestionSchema;
export const StaffQuestionSchema = RawStaffQuestionSchema.brand<'StaffQuestion'>();
export type StaffQuestion = z.infer<typeof StaffQuestionSchema>;

export const RawPublicQuestionSchema = RawStaffQuestionSchema.pick({
  id: true,
  qid: true,
  share_source_publicly: true,
  title: true,
});
export const PublicQuestionSchema = RawPublicQuestionSchema.brand<'PublicQuestion'>();
export type PublicQuestion = z.infer<typeof PublicQuestionSchema>;

/** Topics */
export const StaffTopicSchema = RawTopicSchema.brand<'StaffTopic'>();
export type StaffTopic = z.infer<typeof StaffTopicSchema>;

/** Tags */
export const StaffTagSchema = RawTagSchema.brand<'StaffTag'>();
export type StaffTag = z.infer<typeof StaffTagSchema>;

/** Users */
export const RawStaffUserSchema = RawUserSchema.pick({
  email: true,
  institution_id: true,
  name: true,
  uid: true,
  uin: true,
  user_id: true,
});
export type RawStaffUser = z.infer<typeof RawStaffUserSchema>;
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
