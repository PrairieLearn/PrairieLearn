import parsePostgresInterval from 'postgres-interval';
import { z } from 'zod';

const INTERVAL_MS_PER_SECOND = 1000;
const INTERVAL_MS_PER_MINUTE = 60 * INTERVAL_MS_PER_SECOND;
const INTERVAL_MS_PER_HOUR = 60 * INTERVAL_MS_PER_MINUTE;
const INTERVAL_MS_PER_DAY = 24 * INTERVAL_MS_PER_HOUR;
const INTERVAL_MS_PER_MONTH = 30 * INTERVAL_MS_PER_DAY;
const INTERVAL_MS_PER_YEAR = 365.25 * INTERVAL_MS_PER_DAY;

/**
 * IDs are always coerced to strings. This ensures consistent handling when an
 * ID is fetched directly or via `to_jsonb`, which returns a number.
 *
 * The `refine` step is important to ensure that the thing we've coerced to a
 * string is actually a number. If it's not, we want to fail quickly.
 */
export const IdSchema = z
  .string({ coerce: true })
  .refine((val) => /^\d+$/.test(val), { message: 'ID is not a non-negative integer' });

/**
 * This is a schema for the objects produced by the `postgres-interval` library.
 */
const PostgresIntervalSchema = z.object({
  years: z.number().default(0),
  months: z.number().default(0),
  days: z.number().default(0),
  hours: z.number().default(0),
  minutes: z.number().default(0),
  seconds: z.number().default(0),
  milliseconds: z.number().default(0),
});

/**
 * This schema handles two representations of an interval:
 *
 * - A string like "1 year 2 days", which is how intervals will be represented
 *   if they go through `to_jsonb` in a query.
 * - A {@link PostgresIntervalSchema} object, which is what we'll get if a
 *   query directly returns an interval column. The interval will already be
 *   parsed by `postgres-interval` by way of `pg-types`.
 *
 * In either case, we convert the interval to a number of milliseconds.
 */
export const IntervalSchema = z
  .union([z.string(), PostgresIntervalSchema])
  .transform((interval) => {
    if (typeof interval === 'string') {
      interval = parsePostgresInterval(interval);
    }

    // This calculation matches Postgres's behavior when computing the number of
    // milliseconds in an interval with `EXTRACT(epoch from '...'::interval) * 1000`.
    // The noteworthy parts of this conversion are that 1 year = 365.25 days and
    // 1 month = 30 days.
    return (
      interval.years * INTERVAL_MS_PER_YEAR +
      interval.months * INTERVAL_MS_PER_MONTH +
      interval.days * INTERVAL_MS_PER_DAY +
      interval.hours * INTERVAL_MS_PER_HOUR +
      interval.minutes * INTERVAL_MS_PER_MINUTE +
      interval.seconds * INTERVAL_MS_PER_SECOND +
      interval.milliseconds
    );
  });

/**
 * Accepts either a string or a Date object. If a string is passed, it is
 * validated and parsed as an ISO date string.
 *
 * Useful for parsing dates from JSON, which are always strings.
 */
export const DateFromISOString = z
  .union([z.string(), z.date()])
  .refine(
    (s) => {
      const date = new Date(s);
      return !Number.isNaN(date.getTime());
    },
    {
      message: 'must be a valid ISO date string',
    },
  )
  .transform((s) => new Date(s));

// *******************************************************************************
// Miscellaneous schemas; keep these alphabetized.
// *******************************************************************************

// Result of assessments_format_for_question sproc
export const AssessmentsFormatForQuestionSchema = z.array(
  z.object({
    label: z.string(),
    assessment_id: IdSchema,
    course_instance_id: IdSchema,
    color: z.string(),
  }),
);

// *******************************************************************************
// Enum schemas. These should be alphabetized by their corresponding enum name.
// *******************************************************************************

export const EnumJobStatusSchema = z.enum(['Running', 'Success', 'Error']);
export type EnumJobStatus = z.infer<typeof EnumJobStatusSchema>;

export const EnumModeSchema = z.enum(['Public', 'Exam', 'SEB']);
export type EnumMode = z.infer<typeof EnumModeSchema>;

export const EnumModeReasonSchema = z.enum(['Default', 'PrairieTest', 'Network']);
export type EnumModeReason = z.infer<typeof EnumModeReasonSchema>;

export const EnumPlanGrantTypeSchema = z.enum(['trial', 'stripe', 'invoice', 'gift']);
export type EnumPlanGrantType = z.infer<typeof EnumPlanGrantTypeSchema>;

// *******************************************************************************
// Database table schemas. These should be alphabetized by their corresponding
// table name. For instance, `GroupSchema` should come before `GroupConfigSchema`
// because `Group` comes before `GroupConfig` alphabetically.
// *******************************************************************************

export const AdministratorSchema = z.object({
  id: IdSchema,
  user_id: IdSchema,
});
export type Administrator = z.infer<typeof AdministratorSchema>;

export const AlternativeGroupSchema = z.object({
  advance_score_perc: z.number().nullable(),
  assessment_id: IdSchema,
  id: IdSchema,
  number: z.number().nullable(),
  number_choose: z.number().nullable(),
  zone_id: IdSchema,
});
export type AlternativeGroup = z.infer<typeof AlternativeGroupSchema>;

export const AssessmentSchema = z.object({
  advance_score_perc: z.number().nullable(),
  allow_issue_reporting: z.boolean().nullable(),
  allow_real_time_grading: z.boolean().nullable(),
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
  duration_stat_threshold_labels: z.string().array(),
  duration_stat_threshold_seconds: z.number().array(),
  duration_stat_thresholds: IntervalSchema.array(),
  group_work: z.boolean().nullable(),
  id: IdSchema,
  max_bonus_points: z.number().nullable(),
  max_points: z.number().nullable(),
  multiple_instance: z.boolean().nullable(),
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
  shuffle_questions: z.boolean().nullable(),
  statistics_last_updated_at: DateFromISOString,
  stats_last_updated: DateFromISOString.nullable(),
  sync_errors: z.string().nullable(),
  sync_job_sequence_id: IdSchema.nullable(),
  sync_warnings: z.string().nullable(),
  text: z.string().nullable(),
  tid: z.string().nullable(),
  title: z.string().nullable(),
  type: z.enum(['Exam', 'RetryExam', 'Basic', 'Game', 'Homework']).nullable(),
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
  group_id: IdSchema.nullable(),
  id: IdSchema,
  include_in_statistics: z.boolean(),
  last_client_fingerprint_id: IdSchema.nullable(),
  max_bonus_points: z.number().nullable(),
  max_points: z.number().nullable(),
  mode: EnumModeSchema.nullable(),
  modified_at: DateFromISOString,
  number: z.number().nullable(),
  open: z.boolean().nullable(),
  points: z.number().nullable(),
  score_perc: z.number().nullable(),
  user_id: IdSchema.nullable(),
});
export type AssessmentInstance = z.infer<typeof AssessmentInstanceSchema>;

export const AssessmentModuleSchema = z.object({
  id: IdSchema,
  course_id: IdSchema,
  name: z.string(),
  heading: z.string().nullable(),
  number: z.number().nullable(),
  implicit: z.boolean(),
});
export type AssessmentModule = z.infer<typeof AssessmentModuleSchema>;

export const AssessmentQuestionSchema = z.object({
  advance_score_perc: z.number().nullable(),
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

export const AssessmentQuestionRolePermissionsSchema = z.object({
  assessment_question_id: IdSchema,
  can_submit: z.boolean().nullable(),
  can_view: z.boolean().nullable(),
  group_role_id: IdSchema,
});
export type AssessmentQuestionRolePermissions = z.infer<
  typeof AssessmentQuestionRolePermissionsSchema
>;

export const AssessmentSetSchema = z.object({
  abbreviation: z.string(),
  color: z.string(),
  course_id: IdSchema,
  heading: z.string(),
  id: IdSchema,
  implicit: z.boolean(),
  name: z.string(),
  number: z.number(),
});
export type AssessmentSet = z.infer<typeof AssessmentSetSchema>;

export const AuditLogSchema = z.object({
  action: z.string().nullable(),
  authn_user_id: IdSchema.nullable(),
  column_name: z.string().nullable(),
  course_id: IdSchema.nullable(),
  course_instance_id: IdSchema.nullable(),
  date: DateFromISOString.nullable(),
  group_id: IdSchema.nullable(),
  id: IdSchema,
  institution_id: IdSchema.nullable(),
  new_state: z.any(),
  old_state: z.any(),
  parameters: z.any(),
  row_id: IdSchema.nullable(),
  table_name: z.string().nullable(),
  user_id: IdSchema.nullable(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

export const AuthnProviderSchema = z.object({
  id: IdSchema,
  name: z.string().nullable(),
});
export type AuthnProvider = z.infer<typeof AuthnProviderSchema>;

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
  example_course: z.boolean(),
  id: IdSchema,
  institution_id: IdSchema,
  options: z.any(),
  path: z.string(),
  repository: z.string().nullable(),
  sharing_name: z.string().nullable(),
  sharing_token: z.string(),
  short_name: z.string().nullable(),
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
  enrollment_limit: z.number().nullable(),
  hide_in_enroll_page: z.boolean().nullable(),
  id: IdSchema,
  long_name: z.string().nullable(),
  ps_linked: z.boolean(),
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
  number: z.number().nullable(),
  start_date: DateFromISOString.nullable(),
  uids: z.string().array().nullable(),
});
export type CourseInstanceAccessRule = z.infer<typeof CourseInstanceAccessRuleSchema>;

export const CourseInstancePermissionSchema = z.object({
  course_instance_id: IdSchema,
  course_instance_role: z.enum(['None', 'Student Data Viewer', 'Student Data Editor']).nullable(),
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

export const CoursePermissionSchema = z.object({
  course_id: IdSchema,
  course_role: z.enum(['None', 'Previewer', 'Viewer', 'Editor', 'Owner']).nullable(),
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
  referral_source: z.string().nullable(),
  short_name: z.string(),
  title: z.string(),
  user_id: IdSchema,
  work_email: z.string().nullable(),
});
export type CourseRequest = z.infer<typeof CourseRequestSchema>;

export const EnrollmentSchema = z.object({
  course_instance_id: IdSchema,
  created_at: DateFromISOString,
  id: IdSchema,
  user_id: IdSchema,
});
export type Enrollment = z.infer<typeof EnrollmentSchema>;

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

export const GradingJobSchema = z.object({
  auth_user_id: IdSchema.nullable(),
  auto_points: z.number().nullable(),
  correct: z.boolean().nullable(),
  date: DateFromISOString.nullable(),
  feedback: z.record(z.string(), z.any()).nullable(),
  gradable: z.boolean().nullable(),
  graded_at: DateFromISOString.nullable(),
  graded_by: IdSchema.nullable(),
  grading_finished_at: DateFromISOString.nullable(),
  grading_method: z.enum(['Internal', 'External', 'Manual']).nullable(),
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

export const GroupSchema = z.object({
  course_instance_id: IdSchema,
  date: DateFromISOString.nullable(),
  deleted_at: DateFromISOString.nullable(),
  group_config_id: IdSchema,
  id: IdSchema,
  join_code: z.string(),
  name: z.string(),
});
export type Group = z.infer<typeof GroupSchema>;

export const GroupConfigSchema = z.object({
  assessment_id: IdSchema.nullable(),
  course_instance_id: IdSchema,
  date: DateFromISOString,
  deleted_at: DateFromISOString.nullable(),
  has_roles: z.boolean(),
  id: IdSchema,
  maximum: z.number().nullable(),
  minimum: z.number().nullable(),
  name: z.string().nullable(),
  student_authz_create: z.boolean().nullable(),
  student_authz_leave: z.boolean().nullable(),
  student_authz_join: z.boolean().nullable(),
});
export type GroupConfig = z.infer<typeof GroupConfigSchema>;

export const GroupRoleSchema = z.object({
  assessment_id: IdSchema.nullable(),
  can_assign_roles: z.boolean().nullable(),
  id: IdSchema,
  maximum: z.number().nullable(),
  minimum: z.number().nullable(),
  role_name: z.string(),
});
export type GroupRole = z.infer<typeof GroupRoleSchema>;

export const GroupUserSchema = z.object({
  group_config_id: IdSchema,
  group_id: IdSchema,
  user_id: IdSchema,
});
export type GroupUser = z.infer<typeof GroupUserSchema>;

export const GroupUserRoleSchema = z.object({
  group_id: IdSchema,
  group_role_id: IdSchema,
  id: IdSchema,
  user_id: IdSchema,
});
export type GroupUserRole = z.infer<typeof GroupUserRoleSchema>;

export const InstanceQuestionSchema = z.object({
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
  last_grader: IdSchema.nullable(),
  last_submission_score: z.number().nullable(),
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
  authn_user_id: IdSchema.nullable(),
  course_id: IdSchema.nullable(),
  course_instance_id: IdSchema.nullable(),
  course_request_id: IdSchema.nullable(),
  description: z.string().nullable(),
  finish_date: DateFromISOString.nullable(),
  id: IdSchema,
  legacy: z.boolean(),
  number: z.number().nullable(),
  start_date: DateFromISOString.nullable(),
  status: EnumJobStatusSchema.nullable(),
  type: z.string().nullable(),
  user_id: IdSchema.nullable(),
});
export type JobSequence = z.infer<typeof JobSequenceSchema>;

export const Lti13AssessmentsSchema = z.object({
  assessment_id: IdSchema,
  id: IdSchema,
  last_activity: DateFromISOString,
  lineitem_id_url: z.string(),
  lineitem: z.record(z.string(), z.any()),
  lti13_course_instance_id: IdSchema,
});
export type Lti13Assessments = z.infer<typeof Lti13AssessmentsSchema>;

export const Lti13CourseInstanceSchema = z.object({
  context_id: z.string(),
  context_label: z.string().nullable(),
  context_title: z.string().nullable(),
  course_instance_id: IdSchema,
  created_at: DateFromISOString,
  deployment_id: z.string(),
  id: IdSchema,
  lti13_instance_id: IdSchema,
  lineitems_url: z.string().nullable(),
  context_memberships_url: z.string().nullable(),
});
export type Lti13CourseInstance = z.infer<typeof Lti13CourseInstanceSchema>;

export const Lti13InstanceSchema = z.object({
  access_token_expires_at: DateFromISOString.nullable(),
  access_tokenset: z.any().nullable(),
  client_params: z.any().nullable(),
  created_at: DateFromISOString,
  custom_fields: z.any().nullable(),
  deleted_at: DateFromISOString.nullable(),
  email_attribute: z.string().nullable(),
  id: IdSchema,
  institution_id: IdSchema,
  issuer_params: z.any().nullable(),
  keystore: z.any().nullable(),
  name_attribute: z.string().nullable(),
  name: z.string(),
  platform: z.string(),
  tool_platform_name: z.string().nullable(),
  uid_attribute: z.string().nullable(),
  uin_attribute: z.string().nullable(),
});
export type Lti13Instance = z.infer<typeof Lti13InstanceSchema>;

export const Lti13UserSchema = z.object({
  lti13_instance_id: IdSchema,
  sub: z.string(),
  user_id: IdSchema,
});
export type Lti13User = z.infer<typeof Lti13UserSchema>;

export const LtiCredentialsSchema = z.object({
  consumer_key: z.string().nullable(),
  course_instance_id: z.string().nullable(),
  created_at: DateFromISOString.nullable(),
  deleted_at: DateFromISOString.nullable(),
  id: IdSchema,
  secret: z.string().nullable(),
});
export type LtiCredentials = z.infer<typeof LtiCredentialsSchema>;

export const NewsItemSchema = z.object({
  author: z.string().nullable(),
  date: DateFromISOString,
  directory: z.string(),
  id: IdSchema,
  order_by: z.number(),
  title: z.string(),
  uuid: z.string(),
  visible_to_students: z.boolean(),
});
export type NewsItem = z.infer<typeof NewsItemSchema>;

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
  // The sql column is deprecated and slated for removal in a near-future PR, so it is not included.
});
export type QueryRun = z.infer<typeof QueryRunSchema>;

export const QuestionGenerationContextEmbeddingSchema = z.object({
  id: IdSchema,
  doc_text: z.string(),
  doc_path: z.string(),
  embedding: z.string(),
  chunk_id: z.string(),
});

export const QuestionSchema = z.object({
  client_files: z.array(z.string()).nullable(),
  course_id: IdSchema,
  deleted_at: DateFromISOString.nullable(),
  dependencies: z.any(),
  directory: z.string().nullable(),
  external_grading_enable_networking: z.boolean().nullable(),
  external_grading_enabled: z.boolean().nullable(),
  external_grading_entrypoint: z.string().nullable(),
  external_grading_environment: z.any(),
  external_grading_files: z.any().nullable(),
  external_grading_image: z.string().nullable(),
  external_grading_timeout: z.number().nullable(),
  grading_method: z.enum(['Internal', 'External', 'Manual']),
  id: IdSchema,
  number: z.number().nullable(),
  options: z.any().nullable(),
  partial_credit: z.boolean().nullable(),
  qid: z.string().nullable(),
  shared_publicly: z.boolean(),
  share_source_publicly: z.boolean(),
  show_correct_answer: z.boolean().nullable(),
  single_variant: z.boolean().nullable(),
  sync_errors: z.string().nullable(),
  sync_job_sequence_id: IdSchema.nullable(),
  sync_warnings: z.string().nullable(),
  template_directory: z.string().nullable(),
  title: z.string().nullable(),
  topic_id: IdSchema.nullable(),
  type: z.enum([
    'Calculation',
    'MultipleChoice',
    'Checkbox',
    'File',
    'MultipleTrueFalse',
    'Freeform',
  ]),
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

export const RubricSchema = z.object({
  created_at: DateFromISOString,
  deleted_at: DateFromISOString.nullable(),
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

export const SharingSetSchema = z.object({
  course_id: IdSchema,
  id: IdSchema,
  name: z.string().nullable(),
});
export type SharingSet = z.infer<typeof SharingSetSchema>;

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

export const SubmissionGradingContextEmbeddingSchema = z.object({
  id: IdSchema,
  embedding: z.string(),
  submission_id: IdSchema,
  submission_text: z.string(),
  created_at: DateFromISOString,
  updated_at: DateFromISOString,
  assessment_question_id: IdSchema,
});
export type SubmissionGradingContextEmbedding = z.infer<
  typeof SubmissionGradingContextEmbeddingSchema
>;

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
  grading_method: z.enum(['Internal', 'External', 'Manual']).nullable(),
  grading_requested_at: DateFromISOString.nullable(),
  id: IdSchema,
  manual_rubric_grading_id: IdSchema.nullable(),
  mode: EnumModeSchema.nullable(),
  override_score: z.number().nullable(),
  params: z.record(z.string(), z.any()).nullable(),
  partial_scores: z.record(z.string(), z.any()).nullable(),
  raw_submitted_answer: z.record(z.string(), z.any()).nullable(),
  score: z.number().nullable(),
  submitted_answer: z.record(z.string(), z.any()).nullable(),
  true_answer: z.record(z.string(), z.any()).nullable(),
  v2_score: z.number().nullable(),
  variant_id: IdSchema,
});
export type Submission = z.infer<typeof SubmissionSchema>;

export const TagSchema = z.object({
  color: z.string().nullable(),
  course_id: IdSchema,
  description: z.string().nullable(),
  id: IdSchema,
  implicit: z.boolean(),
  name: z.string().nullable(),
  number: z.number().nullable(),
});
export type Tag = z.infer<typeof TagSchema>;

export const TopicSchema = z.object({
  color: z.string().nullable(),
  course_id: IdSchema,
  description: z.string().nullable(),
  id: IdSchema,
  implicit: z.boolean(),
  name: z.string().nullable(),
  number: z.number().nullable(),
});
export type Topic = z.infer<typeof TopicSchema>;

export const UserSchema = z.object({
  deleted_at: DateFromISOString.nullable(),
  email: z.string().nullable(),
  institution_id: IdSchema,
  lti_context_id: z.string().nullable(),
  lti_course_instance_id: IdSchema.nullable(),
  lti_user_id: z.string().nullable(),
  name: z.string().nullable(),
  stripe_customer_id: z.string().nullable(),
  terms_accepted_at: DateFromISOString.nullable(),
  uid: z.string(),
  uin: z.string().nullable(),
  user_id: IdSchema,
});
export type User = z.infer<typeof UserSchema>;

export const UserSessionSchema = z.object({
  id: IdSchema,
  session_id: z.string(),
  created_at: DateFromISOString,
  updated_at: DateFromISOString,
  expires_at: DateFromISOString,
  user_id: IdSchema.nullable(),
  data: z.any(),
});
export type UserSession = z.infer<typeof UserSessionSchema>;

export const VariantSchema = z.object({
  authn_user_id: IdSchema.nullable(),
  broken: z.boolean().nullable(),
  broken_at: DateFromISOString.nullable(),
  broken_by: IdSchema.nullable(),
  course_id: IdSchema,
  course_instance_id: IdSchema.nullable(),
  date: DateFromISOString.nullable(),
  duration: IntervalSchema.nullable(),
  first_duration: IntervalSchema.nullable(),
  group_id: IdSchema.nullable(),
  id: IdSchema,
  instance_question_id: IdSchema.nullable(),
  num_tries: z.number(),
  number: z.number().nullable(),
  open: z.boolean().nullable(),
  options: z.record(z.string(), z.any()).nullable(),
  params: z.record(z.string(), z.any()).nullable(),
  question_id: IdSchema,
  true_answer: z.record(z.string(), z.any()).nullable(),
  user_id: IdSchema.nullable(),
  variant_seed: z.string().nullable(),
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
  max_points: z.number().nullable(),
  number: z.number().nullable(),
  number_choose: z.number().nullable(),
  title: z.string().nullable(),
});
export type Zone = z.infer<typeof ZoneSchema>;
