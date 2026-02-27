/* eslint perfectionist/sort-objects: error */
/* eslint perfectionist/sort-sets: error */

import { z } from 'zod';

import { DateFromISOString, IdSchema, IntervalSchema } from '@prairielearn/zod';

// *******************************************************************************
// Enum schemas. These should be alphabetized by their corresponding enum name.
// *******************************************************************************

export const EnumAiQuestionGenerationMessageRoleSchema = z.enum(['user', 'assistant']);
export type EnumAiQuestionGenerationMessageRole = z.infer<
  typeof EnumAiQuestionGenerationMessageRoleSchema
>;

export const EnumAiQuestionGenerationMessageStatusSchema = z.enum([
  'streaming',
  'completed',
  'errored',
  'canceled',
]);
export type EnumAiQuestionGenerationMessageStatus = z.infer<
  typeof EnumAiQuestionGenerationMessageStatusSchema
>;

export const EnumAssessmentTypeSchema = z.enum(['Exam', 'RetryExam', 'Basic', 'Game', 'Homework']);
export type EnumAssessmentType = z.infer<typeof EnumAssessmentTypeSchema>;

export const EnumAuditEventActionSchema = z.enum(['insert', 'update', 'delete']);
export type EnumAuditEventAction = z.infer<typeof EnumAuditEventActionSchema>;

export const EnumChunkTypeSchema = z.enum([
  'elements',
  'elementExtensions',
  'clientFilesCourse',
  'serverFilesCourse',
  'clientFilesCourseInstance',
  'clientFilesAssessment',
  'question',
]);
export type EnumChunkType = z.infer<typeof EnumChunkTypeSchema>;

export const EnumCourseRoleSchema = z.enum(['None', 'Previewer', 'Viewer', 'Editor', 'Owner']);
export type EnumCourseRole = z.infer<typeof EnumCourseRoleSchema>;

export const EnumCourseInstanceRoleSchema = z.enum([
  'None',
  'Student Data Viewer',
  'Student Data Editor',
]);
export type EnumCourseInstanceRole = z.infer<typeof EnumCourseInstanceRoleSchema>;

export const EnumEnrollmentStatusSchema = z.enum([
  'invited',
  'joined',
  'left',
  'removed',
  'rejected',
  'blocked',
  'lti13_pending',
]);
export type EnumEnrollmentStatus = z.infer<typeof EnumEnrollmentStatusSchema>;

export const EnumGradingMethodSchema = z.enum(['Internal', 'External', 'Manual']);
export type EnumGradingMethod = z.infer<typeof EnumGradingMethodSchema>;

export const EnumJobStatusSchema = z.enum(['Running', 'Success', 'Error']);
export type EnumJobStatus = z.infer<typeof EnumJobStatusSchema>;

export const EnumModeSchema = z.enum(['Public', 'Exam', 'SEB']);
export type EnumMode = z.infer<typeof EnumModeSchema>;

export const EnumModeReasonSchema = z.enum(['Default', 'PrairieTest', 'Network']);
export type EnumModeReason = z.infer<typeof EnumModeReasonSchema>;

export const EnumPlanGrantTypeSchema = z.enum(['trial', 'stripe', 'invoice', 'gift']);
export type EnumPlanGrantType = z.infer<typeof EnumPlanGrantTypeSchema>;

export const EnumQuestionAccessModeSchema = z.enum([
  'default',
  'blocked_sequence',
  'blocked_lockpoint',
  'read_only_lockpoint',
]);
export type EnumQuestionAccessMode = z.infer<typeof EnumQuestionAccessModeSchema>;

export const EnumQuestionTypeSchema = z.enum([
  'Calculation',
  'MultipleChoice',
  'Checkbox',
  'File',
  'MultipleTrueFalse',
  'Freeform',
]);
export type EnumQuestionType = z.infer<typeof EnumQuestionTypeSchema>;

// *******************************************************************************
// Miscellaneous schemas; keep these alphabetized.
// *******************************************************************************
export const JsonCommentSchema = z.union([z.string(), z.array(z.any()), z.record(z.any())]);

// *******************************************************************************
// Sproc schemas. These should be alphabetized by their corresponding sproc name.
// *******************************************************************************

// Result of check_assessment_access sproc
const SprocCheckAssessmentAccessSchema = z.object({
  active: z.boolean().nullable(),
  credit: z.union([z.string(), z.literal('None')]),
  end_date: z.union([z.string(), z.literal('—')]),
  mode: EnumModeSchema.nullable(),
  start_date: z.union([z.string(), z.literal('—')]),
  time_limit_min: z.union([z.string(), z.literal('—')]),
});

// Result of users_get_displayed_role sproc
export const SprocUsersGetDisplayedRoleSchema = z.enum(['Staff', 'Student', 'None']);
export type SprocUsersGetDisplayedRole = z.infer<typeof SprocUsersGetDisplayedRoleSchema>;

// Result of team_info sproc
export const SprocTeamInfoSchema = z.object({
  id: IdSchema,
  name: z.string(),
  uid_list: z.array(z.string()),
  user_name_list: z.array(z.string()),
  user_roles_list: z.array(SprocUsersGetDisplayedRoleSchema),
});
export type SprocTeamInfo = z.infer<typeof SprocTeamInfoSchema>;

// Result of authz_assessment sproc
export const SprocAuthzAssessmentSchema = z.object({
  access_rules: z.array(SprocCheckAssessmentAccessSchema),
  active: z.boolean(),
  authorized: z.boolean(),
  credit: z.number().nullable(),
  credit_date_string: z.string().nullable(),
  exam_access_end: DateFromISOString.nullable(),
  mode: EnumModeSchema.nullable(),
  next_active_time: z.string().nullable(),
  password: z.string().nullable(),
  show_closed_assessment: z.boolean(),
  show_closed_assessment_score: z.boolean(),
  time_limit_min: z.number().nullable(),
});

// Result of authz_assessment_instance sproc
export const SprocAuthzAssessmentInstanceSchema = z.object({
  access_rules: z.array(SprocCheckAssessmentAccessSchema),
  active: z.boolean(),
  authorized: z.boolean(),
  authorized_edit: z.boolean(),
  credit: z.number().nullable(),
  credit_date_string: z.string().nullable(),
  exam_access_end: DateFromISOString.nullable(),
  mode: EnumModeSchema.nullable(),
  next_active_time: z.string().nullable(),
  password: z.string().nullable(),
  show_closed_assessment: z.boolean(),
  show_closed_assessment_score: z.boolean(),
  time_limit_expired: z.boolean(),
  time_limit_min: z.number().nullable(),
});

// Result of authz_course sproc
export const SprocAuthzCourseSchema = z.object({
  course_role: EnumCourseRoleSchema,
});
export type SprocAuthzCourse = z.infer<typeof SprocAuthzCourseSchema>;

// Result of ip_to_mode sproc
export const SprocIpToModeSchema = z.object({
  mode: EnumModeSchema,
  mode_reason: EnumModeReasonSchema,
});
export type SprocIpToMode = z.infer<typeof SprocIpToModeSchema>;

// Result of users_is_instructor_in_course_instance sproc
export const SprocUsersIsInstructorInCourseInstanceSchema = z.boolean();

// Result of users_select_or_insert sproc
export const SprocUsersSelectOrInsertSchema = z.object({
  result: z.enum(['success', 'invalid_authn_provider']),
  user_id: IdSchema.nullable(),
  user_institution_id: IdSchema.nullable(),
});

// Result of question_order sproc
export const SprocQuestionOrderSchema = z.object({
  instance_question_id: IdSchema,
  question_access_mode: EnumQuestionAccessModeSchema,
  question_number: z.string(),
  row_order: z.number().int(),
});

// Result of server_loads_current sproc
export const SprocServerLoadsCurrentSchema = z.object({
  current_jobs: z.number(),
  instance_count: z.number().int(),
  job_type: z.string(),
  load_perc: z.number(),
  max_jobs: z.number(),
  timestamp_formatted: z.string(),
});

// Result of sync_assessments sproc
export const SprocSyncAssessmentsSchema = z.record(z.string(), IdSchema).nullable();

// Result of authz_course_instance sproc
export const SprocAuthzCourseInstanceSchema = z.object({
  course_instance_role: EnumCourseInstanceRoleSchema,
  /** @deprecated This field only considers the legacy access system. The value should be augmented with the modern publishing system. */
  has_student_access: z.boolean(),
  /** @deprecated This field only considers the legacy access system. The value should be augmented with the modern publishing system. */
  has_student_access_with_enrollment: z.boolean(),
});
export type SprocAuthzCourseInstance = z.infer<typeof SprocAuthzCourseInstanceSchema>;

// *******************************************************************************
// Database table schemas. These should be alphabetized by their corresponding
// table name. For instance, `TeamSchema` should come before `TeamConfigSchema`
// because `Team` comes before `TeamConfig` alphabetically.
// *******************************************************************************

export const AccessTokenSchema = z.object({
  created_at: DateFromISOString,
  id: IdSchema,
  last_used_at: DateFromISOString.nullable(),
  name: z.string(),
  token: z.string().nullable(),
  token_hash: z.string(),
  user_id: IdSchema,
});
export type AccessToken = z.infer<typeof AccessTokenSchema>;

export const AdministratorSchema = z.object({
  id: IdSchema,
  user_id: IdSchema,
});
export type Administrator = z.infer<typeof AdministratorSchema>;

export const AiGradingJobSchema = z.object({
  completion: z.any(),
  completion_tokens: z.number(),
  cost: z.number(),
  course_id: IdSchema,
  course_instance_id: IdSchema,
  grading_job_id: IdSchema,
  id: IdSchema,
  job_sequence_id: IdSchema.nullable(),
  model: z.string(),
  prompt: z.unknown(),
  prompt_tokens: z.number(),
  rotation_correction_degrees: z.record(z.string(), z.number()).nullable(),
});
export type AiGradingJob = z.infer<typeof AiGradingJobSchema>;

export const AiQuestionGenerationMessageSchema = z.object({
  authn_user_id: IdSchema.nullable(),
  created_at: DateFromISOString,
  id: IdSchema,
  include_in_context: z.boolean(),
  job_sequence_id: IdSchema.nullable(),
  model: z.string().nullable(),
  parts: z.array(z.any()),
  question_id: IdSchema,
  role: EnumAiQuestionGenerationMessageRoleSchema,
  status: EnumAiQuestionGenerationMessageStatusSchema,
  updated_at: DateFromISOString,
  usage_input_tokens: z.number(),
  usage_input_tokens_cache_read: z.number(),
  usage_input_tokens_cache_write: z.number(),
  usage_output_tokens: z.number(),
  usage_output_tokens_reasoning: z.number(),
});
export type AiQuestionGenerationMessage = z.infer<typeof AiQuestionGenerationMessageSchema>;

export const AlternativeGroupSchema = z.object({
  advance_score_perc: z.number().nullable(),
  assessment_id: IdSchema,
  id: IdSchema,
  json_allow_real_time_grading: z.boolean().nullable(),
  json_auto_points: z.union([z.number(), z.array(z.number())]).nullable(),
  json_can_submit: z.string().array().nullable(),
  json_can_view: z.string().array().nullable(),
  json_comment: JsonCommentSchema.nullable(),
  json_force_max_points: z.boolean().nullable(),
  json_grade_rate_minutes: z.number().nullable(),
  json_has_alternatives: z.boolean().nullable(),
  json_manual_points: z.number().nullable(),
  json_max_auto_points: z.number().nullable(),
  json_max_points: z.number().nullable(),
  json_points: z.union([z.number(), z.array(z.number())]).nullable(),
  json_tries_per_variant: z.number().nullable(),
  number: z.number(),
  number_choose: z.number().nullable(),
  zone_id: IdSchema,
});
export type AlternativeGroup = z.infer<typeof AlternativeGroupSchema>;

export const AssessmentScoreLogSchema = null;
export const AssessmentStateLogSchema = null;

export const AssessmentSchema = z.object({
  advance_score_perc: z.number().nullable(),
  allow_issue_reporting: z.boolean().nullable(),
  allow_personal_notes: z.boolean(),
  assessment_module_id: IdSchema.nullable(),
  assessment_set_id: IdSchema.nullable(),
  auto_close: z.boolean().nullable(),
  config: z.any().nullable(),
  constant_question_value: z.boolean().nullable(),
  course_instance_id: IdSchema,
  deleted_at: DateFromISOString.nullable(),
  duration_stat_hist: z.number().array(),
  duration_stat_max: IntervalSchema,
  duration_stat_mean: IntervalSchema,
  duration_stat_median: IntervalSchema,
  duration_stat_min: IntervalSchema,
  duration_stat_thresholds: IntervalSchema.array(),
  honor_code: z.string().nullable(),
  id: IdSchema,
  json_allow_real_time_grading: z.boolean().nullable(),
  json_can_submit: z.string().array().nullable(),
  json_can_view: z.string().array().nullable(),
  json_comment: JsonCommentSchema.nullable(),
  json_grade_rate_minutes: z.number().nullable(),
  max_bonus_points: z.number().nullable(),
  max_points: z.number().nullable(),
  modern_access_control: z.boolean(),
  multiple_instance: z.boolean(),
  number: z.string(),
  obj: z.any().nullable(),
  order_by: z.number().nullable(),
  require_honor_code: z.boolean().nullable(),
  score_stat_hist: z.number().array(),
  score_stat_max: z.number(),
  score_stat_mean: z.number(),
  score_stat_median: z.number(),
  score_stat_min: z.number(),
  score_stat_n_hundred: z.number(),
  score_stat_n_hundred_perc: z.number(),
  score_stat_n_zero: z.number(),
  score_stat_n_zero_perc: z.number(),
  score_stat_number: z.number(),
  score_stat_std: z.number(),
  share_source_publicly: z.boolean(),
  shuffle_questions: z.boolean().nullable(),
  statistics_last_updated_at: DateFromISOString,
  stats_last_updated: DateFromISOString.nullable(),
  sync_errors: z.string().nullable(),
  sync_job_sequence_id: IdSchema.nullable(),
  sync_warnings: z.string().nullable(),
  team_work: z.boolean(),
  text: z.string().nullable(),
  tid: z.string().nullable(),
  title: z.string().nullable(),
  type: EnumAssessmentTypeSchema,
  uuid: z.string().nullable(),
});
export type Assessment = z.infer<typeof AssessmentSchema>;

export const AssessmentAccessRuleSchema = z.object({
  active: z.boolean(),
  assessment_id: IdSchema,
  credit: z.number().nullable(),
  end_date: DateFromISOString.nullable(),
  exam_uuid: z.string().nullable(),
  id: IdSchema,
  json_comment: JsonCommentSchema.nullable(),
  mode: EnumModeSchema.nullable(),
  number: z.number(),
  password: z.string().nullable(),
  seb_config: z.any().nullable(),
  show_closed_assessment: z.boolean(),
  show_closed_assessment_score: z.boolean(),
  start_date: DateFromISOString.nullable(),
  time_limit_min: z.number().nullable(),
  uids: z.string().array().nullable(),
});
export type AssessmentAccessRule = z.infer<typeof AssessmentAccessRuleSchema>;

export const AssessmentInstanceCrossedLockpointSchema = z.object({
  assessment_instance_id: IdSchema,
  authn_user_id: IdSchema,
  crossed_at: DateFromISOString,
  id: IdSchema,
  zone_id: IdSchema,
});
export type AssessmentInstanceCrossedLockpoint = z.infer<
  typeof AssessmentInstanceCrossedLockpointSchema
>;

export const AssessmentInstanceSchema = z.object({
  assessment_id: IdSchema,
  auth_user_id: IdSchema.nullable(),
  auto_close: z.boolean().nullable(),
  client_fingerprint_id_change_count: z.number(),
  closed_at: DateFromISOString.nullable(),
  date: DateFromISOString.nullable(),
  date_limit: DateFromISOString.nullable(),
  duration: IntervalSchema.nullable(),
  grading_needed: z.boolean(),
  id: IdSchema,
  include_in_statistics: z.boolean(),
  last_client_fingerprint_id: IdSchema.nullable(),
  max_bonus_points: z.number().nullable(),
  max_points: z.number().nullable(),
  mode: EnumModeSchema.nullable(),
  modified_at: DateFromISOString,
  number: z.number(),
  open: z.boolean().nullable(),
  points: z.number().nullable(),
  score_perc: z.number().nullable(),
  score_perc_pending: z.number(),
  team_id: IdSchema.nullable(),
  user_id: IdSchema.nullable(),
});
export type AssessmentInstance = z.infer<typeof AssessmentInstanceSchema>;

export const AssessmentModuleSchema = z.object({
  course_id: IdSchema,
  heading: z.string(),
  id: IdSchema,
  implicit: z.boolean(),
  name: z.string(),
  number: z.number(),
});
export type AssessmentModule = z.infer<typeof AssessmentModuleSchema>;

export const AssessmentQuestionSchema = z.object({
  advance_score_perc: z.number().nullable(),
  ai_grading_mode: z.boolean(),
  allow_real_time_grading: z.boolean(),
  alternative_group_id: IdSchema.nullable(),
  assessment_id: IdSchema,
  average_average_submission_score: z.number().nullable(),
  average_first_submission_score: z.number().nullable(),
  average_last_submission_score: z.number().nullable(),
  average_max_submission_score: z.number().nullable(),
  average_number_submissions: z.number().nullable(),
  average_submission_score_hist: z.array(z.number()).nullable(),
  average_submission_score_variance: z.number().nullable(),
  deleted_at: DateFromISOString.nullable(),
  discrimination: z.number().nullable(),
  effective_advance_score_perc: z.number().nullable(),
  first_submission_score_hist: z.array(z.number()).nullable(),
  first_submission_score_variance: z.number().nullable(),
  force_max_points: z.boolean().nullable(),
  grade_rate_minutes: z.number().nullable(),
  id: IdSchema,
  incremental_submission_points_array_averages: z.array(z.number()).nullable(),
  incremental_submission_points_array_variances: z.array(z.number()).nullable(),
  incremental_submission_score_array_averages: z.array(z.number()).nullable(),
  incremental_submission_score_array_variances: z.array(z.number()).nullable(),
  init_points: z.number().nullable(),
  json_allow_real_time_grading: z.boolean().nullable(),
  json_auto_points: z.union([z.number(), z.array(z.number())]).nullable(),
  json_comment: JsonCommentSchema.nullable(),
  json_force_max_points: z.boolean().nullable(),
  json_grade_rate_minutes: z.number().nullable(),
  json_manual_points: z.number().nullable(),
  json_max_auto_points: z.number().nullable(),
  json_max_points: z.number().nullable(),
  json_points: z.union([z.number(), z.array(z.number())]).nullable(),
  json_tries_per_variant: z.number().nullable(),
  last_submission_score_hist: z.array(z.number()).nullable(),
  last_submission_score_variance: z.number().nullable(),
  manual_rubric_id: IdSchema.nullable(),
  max_auto_points: z.number().nullable(),
  max_manual_points: z.number().nullable(),
  max_points: z.number().nullable(),
  max_submission_score_hist: z.array(z.number()).nullable(),
  max_submission_score_variance: z.number().nullable(),
  mean_question_score: z.number().nullable(),
  median_question_score: z.number().nullable(),
  number: z.number().nullable(),
  number_in_alternative_group: z.number().nullable(),
  number_submissions_hist: z.array(z.number()).nullable(),
  number_submissions_variance: z.number().nullable(),
  points_list: z.array(z.number()).nullable(),
  question_id: IdSchema,
  question_score_variance: z.number().nullable(),
  quintile_question_scores: z.array(z.number()).nullable(),
  some_nonzero_submission_perc: z.number().nullable(),
  some_perfect_submission_perc: z.number().nullable(),
  some_submission_perc: z.number().nullable(),
  submission_score_array_averages: z.array(z.number()).nullable(),
  submission_score_array_variances: z.array(z.number()).nullable(),
  tries_per_variant: z.number().nullable(),
});
export type AssessmentQuestion = z.infer<typeof AssessmentQuestionSchema>;

export const AssessmentQuestionRolePermissionSchema = z.object({
  assessment_question_id: IdSchema,
  can_submit: z.boolean().nullable(),
  can_view: z.boolean().nullable(),
  team_role_id: IdSchema,
});
export type AssessmentQuestionRolePermission = z.infer<
  typeof AssessmentQuestionRolePermissionSchema
>;

export const AssessmentSetSchema = z.object({
  abbreviation: z.string(),
  color: z.string(),
  course_id: IdSchema,
  heading: z.string(),
  id: IdSchema,
  implicit: z.boolean(),
  json_comment: JsonCommentSchema.nullable(),
  name: z.string(),
  number: z.number(),
});
export type AssessmentSet = z.infer<typeof AssessmentSetSchema>;

export const AuditEventSchema = z.object({
  action: EnumAuditEventActionSchema,
  action_detail: z.string().nullable(),
  agent_authn_user_id: IdSchema.nullable(),
  agent_user_id: IdSchema.nullable(),
  assessment_id: IdSchema.nullable(),
  assessment_instance_id: IdSchema.nullable(),
  assessment_question_id: IdSchema.nullable(),
  context: z.record(z.string(), z.any()),
  course_id: IdSchema.nullable(),
  course_instance_id: IdSchema.nullable(),
  date: DateFromISOString,
  enrollment_id: IdSchema.nullable(),
  id: IdSchema,
  institution_id: IdSchema.nullable(),
  new_row: z.record(z.string(), z.any()).nullable(),
  old_row: z.record(z.string(), z.any()).nullable(),
  row_id: IdSchema,
  subject_user_id: IdSchema.nullable(),
  table_name: z.string(),
  team_id: IdSchema.nullable(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

/** This table is getting deprecated in favor of the audit_event table (see {@link AuditEventSchema}). */
export const AuditLogSchema = z.object({
  action: z.string().nullable(),
  authn_user_id: IdSchema.nullable(),
  column_name: z.string().nullable(),
  course_id: IdSchema.nullable(),
  course_instance_id: IdSchema.nullable(),
  date: DateFromISOString.nullable(),
  id: IdSchema,
  institution_id: IdSchema.nullable(),
  new_state: z.any(),
  old_state: z.any(),
  parameters: z.any(),
  row_id: IdSchema.nullable(),
  table_name: z.string().nullable(),
  team_id: IdSchema.nullable(),
  user_id: IdSchema.nullable(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

export const AuthnProviderSchema = z.object({
  id: IdSchema,
  name: z.enum(['Shibboleth', 'Google', 'Azure', 'LTI', 'SAML', 'LTI 1.3']).nullable(),
});
export type AuthnProvider = z.infer<typeof AuthnProviderSchema>;

export const AuthorSchema = z.object({
  author_name: z.string().nullable(),
  email: z.string().nullable(),
  id: IdSchema,
  orcid: z.string().nullable(),
  origin_course: IdSchema.nullable(),
});
export type Author = z.infer<typeof AuthorSchema>;

export const BatchedMigrationJobSchema = null;
export const BatchedMigrationSchema = null;

export const ChunkSchema = z.object({
  assessment_id: IdSchema.nullable(),
  course_id: IdSchema,
  course_instance_id: IdSchema.nullable(),
  id: IdSchema,
  question_id: IdSchema.nullable(),
  type: EnumChunkTypeSchema,
  uuid: z.string(), // TODO: should this be a UUID?
});
export type Chunk = z.infer<typeof ChunkSchema>;

export const ClientFingerprintSchema = z.object({
  accept_language: z.string().nullable(),
  created_at: DateFromISOString,
  id: IdSchema,
  ip_address: z.string(),
  user_agent: z.string().nullable(),
  user_id: IdSchema,
  user_session_id: IdSchema,
});
export type ClientFingerprint = z.infer<typeof ClientFingerprintSchema>;

export const CourseSchema = z.object({
  announcement_color: z.string().nullable(),
  announcement_html: z.string().nullable(),
  branch: z.string(),
  commit_hash: z.string().nullable(),
  course_instance_enrollment_limit: z.number().nullable(),
  created_at: DateFromISOString,
  deleted_at: DateFromISOString.nullable(),
  display_timezone: z.string(),
  draft_number: z.number(),
  example_course: z.boolean(),
  id: IdSchema,
  institution_id: IdSchema,
  json_comment: JsonCommentSchema.nullable(),
  options: z.any(),
  path: z.string(),
  repository: z.string().nullable(),
  sharing_name: z.string().nullable(),
  sharing_token: z.string(),
  short_name: z.string().nullable(),
  show_getting_started: z.boolean(),
  sync_errors: z.string().nullable(),
  sync_job_sequence_id: IdSchema.nullable(),
  sync_warnings: z.string().nullable(),
  template_course: z.boolean(),
  title: z.string().nullable(),
  yearly_enrollment_limit: z.number().nullable(),
});
export type Course = z.infer<typeof CourseSchema>;

export const CourseInstanceSchema = z.object({
  assessments_group_by: z.enum(['Set', 'Module']),
  course_id: IdSchema,
  deleted_at: DateFromISOString.nullable(),
  display_timezone: z.string(),
  enrollment_code: z.string(),
  enrollment_limit: z.number().nullable(),
  id: IdSchema,
  json_comment: JsonCommentSchema.nullable(),
  long_name: z.string().nullable(),
  modern_publishing: z.boolean(),
  publishing_end_date: DateFromISOString.nullable(),
  publishing_start_date: DateFromISOString.nullable(),
  self_enrollment_enabled: z.boolean(),
  self_enrollment_enabled_before_date: DateFromISOString.nullable(),
  self_enrollment_restrict_to_institution: z.boolean(),
  self_enrollment_use_enrollment_code: z.boolean(),
  share_source_publicly: z.boolean(),
  short_name: z.string().nullable(),
  sync_errors: z.string().nullable(),
  sync_job_sequence_id: IdSchema.nullable(),
  sync_warnings: z.string().nullable(),
  uuid: z.string().nullable(),
});
export type CourseInstance = z.infer<typeof CourseInstanceSchema>;

export const CourseInstanceAccessRuleSchema = z.object({
  course_instance_id: IdSchema,
  end_date: DateFromISOString.nullable(),
  id: IdSchema,
  institution: z.string().nullable(),
  json_comment: JsonCommentSchema.nullable(),
  number: z.number(),
  start_date: DateFromISOString.nullable(),
  uids: z.string().array().nullable(),
});
export type CourseInstanceAccessRule = z.infer<typeof CourseInstanceAccessRuleSchema>;

export const CourseInstancePublishingExtensionSchema = z.object({
  course_instance_id: IdSchema,
  end_date: DateFromISOString,
  id: IdSchema,
  name: z.string().nullable(),
});
export type CourseInstancePublishingExtension = z.infer<
  typeof CourseInstancePublishingExtensionSchema
>;

export const CourseInstancePublishingExtensionEnrollmentSchema = z.object({
  course_instance_publishing_extension_id: IdSchema,
  enrollment_id: IdSchema,
  id: IdSchema,
});
export type CourseInstancePublishingExtensionEnrollment = z.infer<
  typeof CourseInstancePublishingExtensionEnrollmentSchema
>;

export const CourseInstancePermissionSchema = z.object({
  course_instance_id: IdSchema,
  course_instance_role: EnumCourseInstanceRoleSchema.nullable(),
  course_permission_id: IdSchema,
  id: IdSchema,
});
export type CourseInstancePermission = z.infer<typeof CourseInstancePermissionSchema>;

export const CourseInstanceRequiredPlanSchema = z.object({
  course_instance_id: IdSchema,
  id: IdSchema,
  plan_name: z.enum(['basic', 'compute', 'everything']),
});
export type CourseInstanceRequiredPlan = z.infer<typeof CourseInstanceRequiredPlanSchema>;

export const CourseInstanceUsageSchema = null;

export const CoursePermissionSchema = z.object({
  course_id: IdSchema,
  course_role: EnumCourseRoleSchema.nullable(),
  id: IdSchema,
  user_id: IdSchema,
});
export type CoursePermission = z.infer<typeof CoursePermissionSchema>;

export const CourseRequestSchema = z.object({
  approved_by: IdSchema.nullable(),
  approved_status: z.enum(['pending', 'approved', 'denied', 'creating', 'failed']),
  created_at: DateFromISOString,
  first_name: z.string().nullable(),
  github_user: z.string().nullable(),
  id: IdSchema,
  institution: z.string().nullable(),
  last_name: z.string().nullable(),
  note: z.string().nullable(),
  referral_source: z.string().nullable(),
  short_name: z.string(),
  title: z.string(),
  user_id: IdSchema,
  work_email: z.string().nullable(),
});
export type CourseRequest = z.infer<typeof CourseRequestSchema>;

export const CronJobSchema = z.object({
  date: DateFromISOString,
  id: IdSchema,
  name: z.string(),
  succeeded_at: DateFromISOString.nullable(),
});
export type CronJob = z.infer<typeof CronJobSchema>;

export const CurrentPageSchema = null;

export const DraftQuestionMetadataSchema = z.object({
  created_at: DateFromISOString,
  created_by: IdSchema.nullable(),
  id: IdSchema,
  question_id: IdSchema.nullable(),
  updated_by: IdSchema.nullable(),
});
export type DraftQuestionMetadata = z.infer<typeof DraftQuestionMetadataSchema>;

export const EnrollmentSchema = z.object({
  course_instance_id: IdSchema,
  created_at: DateFromISOString.nullable(),
  first_joined_at: DateFromISOString.nullable(),
  id: IdSchema,
  lti_managed: z.boolean(),
  pending_lti13_email: z.string().nullable(),
  pending_lti13_instance_id: IdSchema.nullable(),
  pending_lti13_name: z.string().nullable(),
  pending_lti13_sub: z.string().nullable(),
  pending_uid: z.string().nullable(),
  status: EnumEnrollmentStatusSchema,
  user_id: IdSchema.nullable(),
});
export type Enrollment = z.infer<typeof EnrollmentSchema>;

export const ExamModeNetworkSchema = z.object({
  created_at: DateFromISOString,
  during: z.unknown(), // https://github.com/PrairieLearn/PrairieLearn/pull/12437#discussion_r2219773815
  id: IdSchema,
  location: z.string().nullable(),
  network: z.string().cidr(),
  purpose: z.string().nullable(),
});
export type ExamModeNetwork = z.infer<typeof ExamModeNetworkSchema>;

export const FeatureGrantSchema = null;

export const FileSchema = z.object({
  assessment_id: IdSchema.nullable(),
  assessment_instance_id: IdSchema.nullable(),
  created_at: DateFromISOString,
  created_by: IdSchema.nullable(),
  deleted_at: DateFromISOString.nullable(),
  deleted_by: IdSchema.nullable(),
  display_filename: z.string(),
  id: IdSchema,
  instance_question_id: IdSchema.nullable(),
  storage_filename: z.string(),
  storage_type: z.enum(['FileSystem', 'S3']),
  type: z.string(),
  user_id: IdSchema.nullable(),
});
export type File = z.infer<typeof FileSchema>;

export const FileEditSchema = z.object({
  course_id: IdSchema,
  created_at: DateFromISOString,
  deleted_at: DateFromISOString.nullable(),
  did_save: z.boolean().nullable(),
  did_sync: z.boolean().nullable(),
  dir_name: z.string(),
  file_id: IdSchema.nullable(),
  file_name: z.string(),
  id: IdSchema,
  job_sequence_id: IdSchema.nullable(),
  orig_hash: z.string(),
  user_id: IdSchema,
});
export type FileEdit = z.infer<typeof FileEditSchema>;

export const AiQuestionGenerationPromptSchema = z.object({
  completion: z.any(),
  errors: z.array(z.string()),
  html: z.string().nullable(),
  id: z.string(),
  job_sequence_id: z.string().nullable(),
  prompt_type: z.enum([
    'initial',
    'human_revision',
    'auto_revision',
    'manual_change',
    'manual_revert',
  ]),
  prompting_user_id: z.string(),
  python: z.string().nullable(),
  question_id: z.string(),
  response: z.string(),
  system_prompt: z.string().nullable(),
  user_prompt: z.string(),
});

export type AiQuestionGenerationPrompt = z.infer<typeof AiQuestionGenerationPromptSchema>;

export const FileTransferSchema = z.object({
  created_at: DateFromISOString,
  deleted_at: DateFromISOString.nullable(),
  from_course_id: IdSchema,
  from_filename: z.string(),
  id: IdSchema,
  storage_filename: z.string(),
  to_course_id: IdSchema,
  transfer_type: z.enum(['CopyQuestion', 'CopyCourseInstance']),
  user_id: IdSchema,
});
export type FileTransfer = z.infer<typeof FileTransferSchema>;

export const GraderLoadSchema = null;

export const GradingJobSchema = z.object({
  auth_user_id: IdSchema.nullable(),
  auto_points: z.number().nullable(),
  correct: z.boolean().nullable(),
  date: DateFromISOString.nullable(),
  deleted_at: DateFromISOString.nullable(),
  deleted_by: IdSchema.nullable(),
  feedback: z.record(z.string(), z.any()).nullable(),
  gradable: z.boolean().nullable(),
  graded_at: DateFromISOString.nullable(),
  graded_by: IdSchema.nullable(),
  grading_finished_at: DateFromISOString.nullable(),
  grading_method: z.enum(['Internal', 'External', 'Manual', 'AI']).nullable(),
  grading_received_at: DateFromISOString.nullable(),
  grading_request_canceled_at: DateFromISOString.nullable(),
  grading_request_canceled_by: IdSchema.nullable(),
  grading_requested_at: DateFromISOString.nullable(),
  grading_started_at: DateFromISOString.nullable(),
  grading_submitted_at: DateFromISOString.nullable(),
  id: IdSchema,
  manual_points: z.number().nullable(),
  manual_rubric_grading_id: IdSchema.nullable(),
  output: z.string().nullable(),
  partial_scores: z.record(z.string(), z.any()).nullable(),
  s3_bucket: z.string().nullable(),
  s3_root_key: z.string().nullable(),
  score: z.number().nullable(),
  submission_id: IdSchema,
  v2_score: z.number().nullable(),
});
export type GradingJob = z.infer<typeof GradingJobSchema>;

/** @deprecated */
export const TeamSchema = z.object({
  course_instance_id: IdSchema,
  date: DateFromISOString.nullable(),
  deleted_at: DateFromISOString.nullable(),
  id: IdSchema,
  join_code: z.string(),
  name: z.string(),
  team_config_id: IdSchema,
});
/** @deprecated */
export type Team = z.infer<typeof TeamSchema>;

/** @deprecated */
export const TeamConfigSchema = z.object({
  assessment_id: IdSchema.nullable(),
  course_instance_id: IdSchema,
  date: DateFromISOString,
  deleted_at: DateFromISOString.nullable(),
  has_roles: z.boolean(),
  id: IdSchema,
  maximum: z.number().nullable(),
  minimum: z.number().nullable(),
  name: z.string().nullable(),
  student_authz_choose_name: z.boolean(),
  student_authz_create: z.boolean().nullable(),
  student_authz_join: z.boolean().nullable(),
  student_authz_leave: z.boolean().nullable(),
});
/** @deprecated */
export type TeamConfig = z.infer<typeof TeamConfigSchema>;

/** @deprecated */
export const TeamLogSchema = null;

/** @deprecated */
export const TeamRoleSchema = z.object({
  assessment_id: IdSchema.nullable(),
  can_assign_roles: z.boolean().nullable(),
  id: IdSchema,
  maximum: z.number().nullable(),
  minimum: z.number().nullable(),
  role_name: z.string(),
});
/** @deprecated */
export type TeamRole = z.infer<typeof TeamRoleSchema>;

/** @deprecated */
export const TeamUserSchema = z.object({
  team_config_id: IdSchema,
  team_id: IdSchema,
  user_id: IdSchema,
});
/** @deprecated */
export type TeamUser = z.infer<typeof TeamUserSchema>;

/** @deprecated */
export const TeamUserRoleSchema = z.object({
  id: IdSchema,
  team_id: IdSchema,
  team_role_id: IdSchema,
  user_id: IdSchema,
});
/** @deprecated */
export type TeamUserRole = z.infer<typeof TeamUserRoleSchema>;

// Backwards compatibility aliases for renamed group/team tables
// In early 2025, we'd planned to rename "groups" to "teams". We got halfway through
// the migration before realizing that it was a poor idea. We were able to undo most
// of the changes, with the exception of database table/column names.
//
// The "group" aliases below allow us to refer to "groups" throughout the codebase.
// Once we undo the renaming, we can make these the primary types/schemas again and
// remove the "team" versions.
export const GroupSchema = TeamSchema;
export type Group = Team;
export const GroupConfigSchema = TeamConfigSchema;
export type GroupConfig = TeamConfig;
export const GroupRoleSchema = TeamRoleSchema;
export type GroupRole = TeamRole;
export const GroupUserSchema = TeamUserSchema;
export type GroupUser = TeamUser;
export const GroupUserRoleSchema = TeamUserRoleSchema;
export type GroupUserRole = TeamUserRole;
export const GroupLogSchema = TeamLogSchema;

export const InstanceQuestionSchema = z.object({
  ai_instance_question_group_id: IdSchema.nullable(),
  assessment_instance_id: IdSchema,
  assessment_question_id: IdSchema,
  assigned_grader: IdSchema.nullable(),
  authn_user_id: IdSchema.nullable(),
  auto_points: z.number().nullable(),
  average_submission_score: z.number().nullable(),
  created_at: DateFromISOString.nullable(),
  current_value: z.number().nullable(),
  duration: IntervalSchema.nullable(),
  first_duration: IntervalSchema.nullable(),
  first_submission_score: z.number().nullable(),
  highest_submission_score: z.number().nullable(),
  id: IdSchema,
  incremental_submission_points_array: z.array(z.number().nullable()).nullable(),
  incremental_submission_score_array: z.array(z.number().nullable()).nullable(),
  is_ai_graded: z.boolean(),
  last_grader: IdSchema.nullable(),
  last_submission_score: z.number().nullable(),
  manual_instance_question_group_id: IdSchema.nullable(),
  manual_points: z.number().nullable(),
  max_submission_score: z.number().nullable(),
  modified_at: DateFromISOString,
  number: z.number().nullable(),
  number_attempts: z.number(),
  open: z.boolean(),
  order_by: z.number().nullable(),
  points: z.number().nullable(),
  points_list: z.array(z.number()).nullable(),
  points_list_original: z.array(z.number()).nullable(),
  requires_manual_grading: z.boolean(),
  score_perc: z.number().nullable(),
  some_nonzero_submission: z.boolean().nullable(),
  some_perfect_submission: z.boolean().nullable(),
  some_submission: z.boolean().nullable(),
  status: z
    .enum(['complete', 'unanswered', 'saved', 'correct', 'incorrect', 'grading', 'invalid'])
    .nullable(),
  submission_score_array: z.array(z.number().nullable()).nullable(),
  used_for_grade: z.boolean().nullable(),
  variants_points_list: z.array(z.number().nullable()),
});
export type InstanceQuestion = z.infer<typeof InstanceQuestionSchema>;

export const InstanceQuestionGroupSchema = z.object({
  assessment_question_id: IdSchema,
  id: IdSchema,
  instance_question_group_description: z.string(),
  instance_question_group_name: z.string(),
});
export type InstanceQuestionGroup = z.infer<typeof InstanceQuestionGroupSchema>;

export const InstitutionAuthnProviderSchema = null;

export const InstitutionSchema = z.object({
  course_instance_enrollment_limit: z.number(),
  default_authn_provider_id: IdSchema.nullable(),
  display_timezone: z.string(),
  id: IdSchema,
  long_name: z.string(),
  short_name: z.string(),
  uid_regexp: z.string().nullable(),
  yearly_enrollment_limit: z.number(),
});
export type Institution = z.infer<typeof InstitutionSchema>;

export const InstitutionAdministratorSchema = z.object({
  id: IdSchema,
  institution_id: IdSchema,
  user_id: IdSchema,
});
export type InstitutionAdministrator = z.infer<typeof InstitutionAdministratorSchema>;

export const IssueSchema = z.object({
  assessment_id: IdSchema.nullable(),
  authn_user_id: IdSchema.nullable(),
  course_caused: z.boolean().nullable(),
  course_data: z.record(z.string(), z.any()).nullable(),
  course_id: IdSchema.nullable(),
  course_instance_id: IdSchema.nullable(),
  date: DateFromISOString.nullable(),
  id: IdSchema,
  instance_question_id: IdSchema.nullable(),
  instructor_message: z.string().nullable(),
  manually_reported: z.boolean().nullable(),
  open: z.boolean().nullable(),
  question_id: IdSchema.nullable(),
  student_message: z.string().nullable(),
  system_data: z.record(z.string(), z.any()).nullable(),
  user_id: IdSchema.nullable(),
  variant_id: IdSchema.nullable(),
});
export type Issue = z.infer<typeof IssueSchema>;

export const JobSchema = z.object({
  arguments: z.string().array().nullable(),
  assessment_id: IdSchema.nullable(),
  assessment_question_id: IdSchema.nullable(),
  authn_user_id: IdSchema.nullable(),
  command: z.string().nullable(),
  course_id: IdSchema.nullable(),
  course_instance_id: IdSchema.nullable(),
  course_request_id: IdSchema.nullable(),
  data: z.any().nullable(),
  description: z.string().nullable(),
  env: z.record(z.string(), z.any()).nullable(),
  error_message: z.string().nullable(),
  exit_code: z.number().nullable(),
  exit_signal: z.string().nullable(),
  finish_date: DateFromISOString.nullable(),
  heartbeat_at: DateFromISOString.nullable(),
  id: IdSchema,
  job_sequence_id: IdSchema.nullable(),
  last_in_sequence: z.boolean().nullable(),
  no_job_sequence_update: z.boolean().nullable(),
  number_in_sequence: z.number().nullable(),
  output: z.string().nullable(),
  start_date: DateFromISOString.nullable(),
  status: EnumJobStatusSchema.nullable(),
  type: z.string().nullable(),
  user_id: IdSchema.nullable(),
  working_directory: z.string().nullable(),
});
export type Job = z.infer<typeof JobSchema>;

export const JobSequenceSchema = z.object({
  assessment_id: IdSchema.nullable(),
  assessment_question_id: IdSchema.nullable(),
  authn_user_id: IdSchema.nullable(),
  course_id: IdSchema.nullable(),
  course_instance_id: IdSchema.nullable(),
  course_request_id: IdSchema.nullable(),
  description: z.string().nullable(),
  finish_date: DateFromISOString.nullable(),
  id: IdSchema,
  legacy: z.boolean(),
  number: z.number(),
  start_date: DateFromISOString.nullable(),
  status: EnumJobStatusSchema.nullable(),
  type: z.string().nullable(),
  user_id: IdSchema.nullable(),
});
export type JobSequence = z.infer<typeof JobSequenceSchema>;

export const LastAccessSchema = null;

export const Lti13AssessmentSchema = z.object({
  assessment_id: IdSchema,
  id: IdSchema,
  last_activity: DateFromISOString,
  lineitem: z.record(z.string(), z.any()),
  lineitem_id_url: z.string(),
  lti13_course_instance_id: IdSchema,
});
export type Lti13Assessment = z.infer<typeof Lti13AssessmentSchema>;

export const Lti13CourseInstanceSchema = z.object({
  context_id: z.string(),
  context_label: z.string().nullable(),
  context_memberships_url: z.string().nullable(),
  context_title: z.string().nullable(),
  course_instance_id: IdSchema,
  created_at: DateFromISOString,
  deployment_id: z.string(),
  enrollment_lti_enforced: z.boolean(),
  enrollment_lti_enforced_after_date: DateFromISOString.nullable(),
  id: IdSchema,
  lineitems_url: z.string().nullable(),
  lti13_instance_id: IdSchema,
});
export type Lti13CourseInstance = z.infer<typeof Lti13CourseInstanceSchema>;

export const Lti13InstanceSchema = z.object({
  access_token_expires_at: DateFromISOString.nullable(),
  access_tokenset: z
    .object({
      access_token: z.string(),
      expires_at: z.number().optional(),
      expires_in: z.number().optional(),
      scope: z.string(),
      token_type: z.string(),
    })
    .refine(
      (token) => {
        // expires_at is from the openid-client v5 token representation
        // expires_in is from the openid-client v6
        // Either both present or both missing is an error case
        return (token.expires_at === undefined) !== (token.expires_in === undefined);
      },
      {
        message: 'Provide exactly one of expires_at or expires_in',
      },
    )
    .nullable(),
  client_params: z.any().nullable(),
  created_at: DateFromISOString,
  custom_fields: z.any().nullable(),
  deleted_at: DateFromISOString.nullable(),
  email_attribute: z.string().nullable(),
  id: IdSchema,
  institution_id: IdSchema,
  issuer_params: z.any().nullable(),
  keystore: z
    .object({
      keys: z.record(z.string(), z.any()).array(),
    })
    .nullable(),
  name: z.string(),
  name_attribute: z.string().nullable(),
  platform: z.string(),
  require_linked_lti_user: z.boolean(),
  tool_platform_name: z.string().nullable(),
  uid_attribute: z.string().nullable(),
  uin_attribute: z.string().nullable(),
});
export type Lti13Instance = z.infer<typeof Lti13InstanceSchema>;

export const Lti13UserSchema = z.object({
  id: IdSchema,
  lti13_instance_id: IdSchema,
  sub: z.string(),
  user_id: IdSchema,
});
export type Lti13User = z.infer<typeof Lti13UserSchema>;

export const LtiCredentialSchema = z.object({
  consumer_key: z.string().nullable(),
  course_instance_id: IdSchema.nullable(),
  created_at: DateFromISOString.nullable(),
  deleted_at: DateFromISOString.nullable(),
  id: IdSchema,
  secret: z.string().nullable(),
});
export type LtiCredential = z.infer<typeof LtiCredentialSchema>;

export const LtiLinkSchema = z.object({
  assessment_id: IdSchema.nullable(),
  context_id: z.string().nullable(),
  course_instance_id: IdSchema.nullable(),
  created_at: DateFromISOString,
  deleted_at: DateFromISOString.nullable(),
  id: IdSchema,
  resource_link_description: z.string().nullable(),
  resource_link_id: z.string().nullable(),
  resource_link_title: z.string().nullable(),
});
export type LtiLink = z.infer<typeof LtiLinkSchema>;

export const LtiOutcomeSchema = z.object({
  assessment_id: IdSchema.nullable(),
  id: IdSchema,
  lis_outcome_service_url: z.string().nullable(),
  lis_result_sourcedid: z.string().nullable(),
  lti_credential_id: IdSchema.nullable(),
  user_id: IdSchema.nullable(),
});
export const MigrationSchema = null;
export const NamedLockSchema = null;

export const PageViewLogSchema = null;

export const PlanGrantSchema = z.object({
  course_instance_id: IdSchema.nullable(),
  created_at: DateFromISOString,
  id: IdSchema,
  institution_id: IdSchema.nullable(),
  plan_name: z.enum(['basic', 'compute', 'everything']),
  type: EnumPlanGrantTypeSchema,
  user_id: IdSchema.nullable(),
});
export type PlanGrant = z.infer<typeof PlanGrantSchema>;

export const QueryRunSchema = z.object({
  authn_user_id: IdSchema,
  date: DateFromISOString,
  error: z.string().nullable(),
  id: IdSchema,
  name: z.string(),
  params: z.record(z.string(), z.any()).nullable(),
  result: z.record(z.string(), z.any()).nullable(),
});
export type QueryRun = z.infer<typeof QueryRunSchema>;

export const QuestionAuthorSchema = z.object({
  author_id: IdSchema,
  id: IdSchema,
  question_id: IdSchema,
});

export const QuestionGenerationContextEmbeddingSchema = z.object({
  chunk_id: z.string(),
  doc_path: z.string(),
  doc_text: z.string(),
  embedding: z.string(),
  id: IdSchema,
});

export const QuestionSchema = z.object({
  client_files: z.array(z.string()).nullable(),
  course_id: IdSchema,
  deleted_at: DateFromISOString.nullable(),
  dependencies: z.any(),
  directory: z.string().nullable(),
  draft: z.boolean(),
  external_grading_enable_networking: z.boolean().nullable(),
  external_grading_enabled: z.boolean().nullable(),
  external_grading_entrypoint: z.string().nullable(),
  external_grading_environment: z.record(z.string(), z.string().nullable()),
  external_grading_files: z.any().nullable(),
  external_grading_image: z.string().nullable(),
  external_grading_timeout: z.number().nullable(),
  grading_method: EnumGradingMethodSchema,
  id: IdSchema,
  json_comment: JsonCommentSchema.nullable(),
  json_external_grading_comment: z
    .union([z.string(), z.array(z.any()), z.record(z.any())])
    .nullable(),
  json_workspace_comment: z.union([z.string(), z.array(z.any()), z.record(z.any())]).nullable(),
  number: z.number().nullable(),
  options: z.any().nullable(),
  partial_credit: z.boolean().nullable(),
  qid: z.string().nullable(),
  share_publicly: z.boolean(),
  share_source_publicly: z.boolean(),
  show_correct_answer: z.boolean().nullable(),
  single_variant: z.boolean().nullable(),
  sync_errors: z.string().nullable(),
  sync_job_sequence_id: IdSchema.nullable(),
  sync_warnings: z.string().nullable(),
  template_directory: z.string().nullable(),
  title: z.string().nullable(),
  topic_id: IdSchema.nullable(),
  type: EnumQuestionTypeSchema.nullable(),
  uuid: z.string().nullable(),
  workspace_args: z.string().nullable(),
  workspace_enable_networking: z.boolean().nullable(),
  workspace_environment: z.any().nullable(),
  workspace_graded_files: z.array(z.string()).nullable(),
  workspace_home: z.string().nullable(),
  workspace_image: z.string().nullable(),
  workspace_port: z.number().nullable(),
  workspace_url_rewrite: z.boolean().nullable(),
});
export type Question = z.infer<typeof QuestionSchema>;
export const QuestionScoreLogSchema = null;
export const QuestionTagSchema = z.object({
  id: IdSchema,
  question_id: IdSchema,
  tag_id: IdSchema,
});
export type QuestionTag = z.infer<typeof QuestionTagSchema>;

export const RubricSchema = z.object({
  created_at: DateFromISOString,
  deleted_at: DateFromISOString.nullable(),
  grader_guidelines: z.string().nullable(),
  id: IdSchema,
  max_extra_points: z.number(),
  min_points: z.number(),
  modified_at: DateFromISOString,
  replace_auto_points: z.boolean(),
  starting_points: z.number(),
});
export type Rubric = z.infer<typeof RubricSchema>;

export const RubricGradingSchema = z.object({
  adjust_points: z.number(),
  computed_points: z.number(),
  id: IdSchema,
  max_extra_points: z.number(),
  min_points: z.number(),
  rubric_id: IdSchema,
  starting_points: z.number(),
});
export type RubricGrading = z.infer<typeof RubricGradingSchema>;

export const RubricGradingItemSchema = z.object({
  description: z.string(),
  id: IdSchema,
  points: z.number(),
  rubric_grading_id: IdSchema,
  rubric_item_id: IdSchema,
  score: z.number(),
});
export type RubricGradingItem = z.infer<typeof RubricGradingItemSchema>;

export const RubricItemSchema = z.object({
  always_show_to_students: z.boolean(),
  deleted_at: DateFromISOString.nullable(),
  description: z.string(),
  explanation: z.string().nullable(),
  grader_note: z.string().nullable(),
  id: IdSchema,
  key_binding: z.string().nullable(),
  number: z.number(),
  points: z.number(),
  rubric_id: IdSchema,
});
export type RubricItem = z.infer<typeof RubricItemSchema>;

export const SamlProviderSchema = z.object({
  certificate: z.string(),
  email_attribute: z.string().nullable(),
  id: IdSchema,
  institution_id: IdSchema,
  issuer: z.string(),
  name_attribute: z.string().nullable(),
  private_key: z.string(),
  public_key: z.string(),
  sso_login_url: z.string(),
  uid_attribute: z.string().nullable(),
  uin_attribute: z.string().nullable(),
  validate_audience: z.boolean(),
  want_assertions_signed: z.boolean(),
  want_authn_response_signed: z.boolean(),
});
export type SamlProvider = z.infer<typeof SamlProviderSchema>;

export const ServerLoadSchema = null;

export const SharingSetSchema = z.object({
  course_id: IdSchema,
  description: z.string().nullable(),
  id: IdSchema,
  name: z.string().nullable(),
});
export type SharingSet = z.infer<typeof SharingSetSchema>;

export const SharingSetCourseSchema = null;
export const SharingSetQuestionSchema = null;

export const StripeCheckoutSessionSchema = z.object({
  agent_user_id: IdSchema,
  completed_at: DateFromISOString.nullable(),
  course_instance_id: IdSchema.nullable(),
  created_at: DateFromISOString,
  data: z.any(),
  id: IdSchema,
  plan_grants_created: z.boolean(),
  plan_names: z.array(z.enum(['basic', 'compute', 'everything'])),
  stripe_object_id: z.string(),
  subject_user_id: IdSchema.nullable(),
});
export type StripeCheckoutSession = z.infer<typeof StripeCheckoutSessionSchema>;

export const StudentLabelSchema = z.object({
  color: z.string(),
  course_instance_id: IdSchema,
  id: IdSchema,
  name: z.string(),
  uuid: z.string(),
});
export type StudentLabel = z.infer<typeof StudentLabelSchema>;

export const StudentLabelEnrollmentSchema = z.object({
  enrollment_id: IdSchema,
  id: IdSchema,
  student_label_id: IdSchema,
});
export type StudentLabelEnrollment = z.infer<typeof StudentLabelEnrollmentSchema>;

export const SubmissionSchema = z.object({
  auth_user_id: IdSchema.nullable(),
  broken: z.boolean().nullable(),
  client_fingerprint_id: IdSchema.nullable(),
  correct: z.boolean().nullable(),
  credit: z.number().nullable(),
  date: DateFromISOString.nullable(),
  duration: IntervalSchema.nullable(),
  feedback: z.record(z.string(), z.any()).nullable(),
  format_errors: z.record(z.string(), z.any()).nullable(),
  gradable: z.boolean().nullable(),
  graded_at: DateFromISOString.nullable(),
  grading_requested_at: DateFromISOString.nullable(),
  id: IdSchema,
  is_ai_graded: z.boolean(),
  manual_rubric_grading_id: IdSchema.nullable(),
  mode: EnumModeSchema.nullable(),
  modified_at: DateFromISOString,
  override_score: z.number().nullable(),
  params: z.record(z.string(), z.any()).nullable(),
  partial_scores: z.record(z.string(), z.any()).nullable(),
  raw_submitted_answer: z.record(z.string(), z.any()).nullable(),
  regradable: z.boolean().default(false),
  score: z.number().nullable(),
  submitted_answer: z.record(z.string(), z.any()).nullable(),
  true_answer: z.record(z.string(), z.any()).nullable(),
  v2_score: z.number().nullable(),
  variant_id: IdSchema,
});
export type Submission = z.infer<typeof SubmissionSchema>;

export const TagSchema = z.object({
  color: z.string(),
  course_id: IdSchema,
  description: z.string(),
  id: IdSchema,
  implicit: z.boolean(),
  json_comment: JsonCommentSchema.nullable(),
  name: z.string(),
  number: z.number(),
});
export type Tag = z.infer<typeof TagSchema>;

export const TimeSeriesSchema = null;

export const TopicSchema = z.object({
  color: z.string(),
  course_id: IdSchema,
  description: z.string(),
  id: IdSchema,
  implicit: z.boolean(),
  json_comment: JsonCommentSchema.nullable(),
  name: z.string(),
  number: z.number(),
});
export type Topic = z.infer<typeof TopicSchema>;

export const UserSchema = z.object({
  deleted_at: DateFromISOString.nullable(),
  email: z.string().nullable(),
  id: IdSchema,
  institution_id: IdSchema,
  lti_context_id: z.string().nullable(),
  lti_course_instance_id: IdSchema.nullable(),
  lti_user_id: z.string().nullable(),
  name: z.string().nullable(),
  stripe_customer_id: z.string().nullable(),
  terms_accepted_at: DateFromISOString.nullable(),
  uid: z.string(),
  uin: z.string().nullable(),
});
export type User = z.infer<typeof UserSchema>;

export const UserSessionSchema = z.object({
  created_at: DateFromISOString,
  data: z.any(),
  expires_at: DateFromISOString,
  id: IdSchema,
  revoked_at: DateFromISOString.nullable(),
  session_id: z.string(),
  updated_at: DateFromISOString,
  user_id: IdSchema.nullable(),
});
export type UserSession = z.infer<typeof UserSessionSchema>;

export const VariantSchema = z.object({
  authn_user_id: IdSchema,
  broken: z.boolean().nullable(),
  broken_at: DateFromISOString.nullable(),
  broken_by: IdSchema.nullable(),
  client_fingerprint_id: IdSchema.nullable(),
  course_id: IdSchema,
  course_instance_id: IdSchema.nullable(),
  date: DateFromISOString.nullable(),
  duration: IntervalSchema.nullable(),
  first_duration: IntervalSchema.nullable(),
  id: IdSchema,
  instance_question_id: IdSchema.nullable(),
  modified_at: DateFromISOString,
  num_tries: z.number(),
  number: z.number().nullable(),
  open: z.boolean().nullable(),
  options: z.record(z.string(), z.any()).nullable(),
  params: z.record(z.string(), z.any()).nullable(),
  question_id: IdSchema,
  team_id: IdSchema.nullable(),
  true_answer: z.record(z.string(), z.any()).nullable(),
  user_id: IdSchema.nullable(),
  variant_seed: z.string(),
  workspace_id: IdSchema.nullable(),
});
export type Variant = z.infer<typeof VariantSchema>;

export const WorkspaceSchema = z.object({
  created_at: DateFromISOString,
  disk_usage_bytes: z.coerce.number().nullable(), // This is BIGINT, but always fits a number
  heartbeat_at: DateFromISOString.nullable(),
  hostname: z.string().nullable(),
  id: IdSchema,
  launch_port: z.coerce.number(), // This is BIGINT, but always fits a number
  launch_uuid: z.string().nullable(),
  launched_at: DateFromISOString.nullable(),
  launching_duration: IntervalSchema.nullable(),
  message: z.string().nullable(),
  message_updated_at: DateFromISOString,
  rebooted_at: DateFromISOString.nullable(),
  reset_at: DateFromISOString.nullable(),
  running_at: DateFromISOString.nullable(),
  running_duration: IntervalSchema.nullable(),
  state: z.enum(['uninitialized', 'stopped', 'launching', 'running']),
  state_updated_at: DateFromISOString,
  stopped_at: DateFromISOString.nullable(),
  version: z.coerce.number(), // This is BIGINT, but always fits a number
  workspace_host_id: IdSchema.nullable(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const WorkspaceHostSchema = z.object({
  hostname: z.string().nullable(),
  id: IdSchema,
  instance_id: z.string(),
  launched_at: DateFromISOString.nullable(),
  load_count: z.number().nullable(),
  ready_at: DateFromISOString.nullable(),
  state: z
    .enum(['launching', 'ready', 'draining', 'unhealthy', 'terminating', 'terminated'])
    .nullable(),
  state_changed_at: DateFromISOString.nullable(),
  terminated_at: DateFromISOString.nullable(),
  unhealthy_at: DateFromISOString.nullable(),
  unhealthy_reason: z.string().nullable(),
});
export type WorkspaceHost = z.infer<typeof WorkspaceHostSchema>;

export const WorkspaceHostLogSchema = null;

export const WorkspaceLogSchema = z.object({
  date: DateFromISOString.nullable(),
  id: IdSchema,
  message: z.string().nullable(),
  state: z.enum(['uninitialized', 'stopped', 'launching', 'running']).nullable(),
  version: z.string(),
  workspace_id: IdSchema,
});
export type WorkspaceLog = z.infer<typeof WorkspaceLogSchema>;

export const ZoneSchema = z.object({
  advance_score_perc: z.number().nullable(),
  assessment_id: IdSchema,
  best_questions: z.number().nullable(),
  id: IdSchema,
  json_allow_real_time_grading: z.boolean().nullable(),
  json_can_submit: z.string().array().nullable(),
  json_can_view: z.string().array().nullable(),
  json_comment: JsonCommentSchema.nullable(),
  json_grade_rate_minutes: z.number().nullable(),
  lockpoint: z.boolean(),
  max_points: z.number().nullable(),
  number: z.number(),
  number_choose: z.number().nullable(),
  title: z.string().nullable(),
});
export type Zone = z.infer<typeof ZoneSchema>;

// *******************************************************************************
// Miscellaneous schemas.
// *******************************************************************************

export const TableNames = [
  'access_tokens',
  'administrators',
  'ai_grading_jobs',
  'ai_question_generation_messages',
  'ai_question_generation_prompts',
  'alternative_groups',
  'assessment_access_rules',
  'assessment_instance_crossed_lockpoints',
  'assessment_instances',
  'assessment_modules',
  'assessment_question_role_permissions',
  'assessment_questions',
  'assessment_score_logs',
  'assessment_sets',
  'assessment_state_logs',
  'assessments',
  'audit_events',
  'audit_logs',
  'authn_providers',
  'authors',
  'batched_migration_jobs',
  'batched_migrations',
  'chunks',
  'client_fingerprints',
  'course_instance_access_rules',
  'course_instance_permissions',
  'course_instance_publishing_extension_enrollments',
  'course_instance_publishing_extensions',
  'course_instance_required_plans',
  'course_instance_usages',
  'course_instances',
  'course_permissions',
  'course_requests',
  'cron_jobs',
  'current_pages',
  'draft_question_metadata',
  'enrollments',
  'exam_mode_networks',
  'feature_grants',
  'file_edits',
  'file_transfers',
  'files',
  'grader_loads',
  'grading_jobs',
  'team_configs',
  'team_logs',
  'team_roles',
  'team_user_roles',
  'team_users',
  'teams',
  'instance_questions',
  'instance_question_groups',
  'institution_administrators',
  'institution_authn_providers',
  'institutions',
  'issues',
  'job_sequences',
  'jobs',
  'last_accesses',
  'lti13_assessments',
  'lti13_course_instances',
  'lti13_instances',
  'lti13_users',
  'lti_credentials',
  'lti_links',
  'lti_outcomes',
  'migrations',
  'named_locks',
  'page_view_logs',
  'courses',
  'plan_grants',
  'query_runs',
  'question_authors',
  'question_generation_context_embeddings',
  'question_score_logs',
  'question_tags',
  'questions',
  'rubric_grading_items',
  'rubric_gradings',
  'rubric_items',
  'rubrics',
  'saml_providers',
  'server_loads',
  'sharing_set_courses',
  'sharing_set_questions',
  'sharing_sets',
  'stripe_checkout_sessions',
  'student_label_enrollments',
  'student_labels',
  'submissions',
  'tags',
  'time_series',
  'topics',
  'user_sessions',
  'users',
  'variants',
  'workspace_host_logs',
  'workspace_hosts',
  'workspace_logs',
  'workspaces',
  'zones',
] as const;
export type TableName = (typeof TableNames)[number];
