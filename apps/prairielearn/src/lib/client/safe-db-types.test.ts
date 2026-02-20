/* eslint perfectionist/sort-objects: error */

import { describe, expect, it } from 'vitest';
import type z from 'zod';

import {
  RawStaffEnrollmentSchema,
  RawStudentEnrollmentSchema,
  StaffAlternativeGroupSchema,
  StaffAssessmentInstanceSchema,
  StaffAssessmentQuestionSchema,
  StaffAssessmentSchema,
  StaffAssessmentSetSchema,
  StaffAuditEventSchema,
  StaffCourseInstanceSchema,
  StaffCourseSchema,
  StaffEnrollmentSchema,
  StaffInstitutionSchema,
  StaffQuestionSchema,
  StaffTagSchema,
  StaffTopicSchema,
  StaffUserSchema,
  StaffZoneSchema,
  StudentAssessmentInstanceSchema__UNSAFE,
  StudentAssessmentSchema,
  StudentAssessmentSetSchema,
  StudentCourseInstanceSchema,
  StudentCourseSchema,
  StudentUserSchema,
} from './safe-db-types.js';

// Minimal valid data for each schema (with required fields only)
const minimalStaffCourse: z.input<typeof StaffCourseSchema> = {
  announcement_color: null,
  announcement_html: null,
  branch: 'main',
  commit_hash: null,
  course_instance_enrollment_limit: null,
  created_at: new Date(),
  deleted_at: null,
  display_timezone: 'UTC',
  example_course: false,
  id: '1',
  institution_id: '2',
  json_comment: null,
  options: {},
  path: 'path',
  repository: null,
  sharing_name: null,
  short_name: null,
  show_getting_started: false,
  sync_errors: null,
  sync_job_sequence_id: null,
  sync_warnings: null,
  template_course: false,
  title: null,
};

// StudentCourse omits many fields from StaffCourse
const minimalStudentCourse: z.input<typeof StudentCourseSchema> = {
  created_at: new Date(),
  deleted_at: null,
  display_timezone: 'UTC',
  example_course: false,
  id: '1',
  institution_id: '2',
  short_name: null,
  template_course: false,
  title: null,
};

const minimalStaffCourseInstance: z.input<typeof StaffCourseInstanceSchema> = {
  assessments_group_by: 'Set',
  course_id: '1',
  deleted_at: null,
  display_timezone: 'UTC',
  enrollment_code: 'AAABBBCCCC',
  enrollment_limit: null,
  id: '3',
  json_comment: null,
  long_name: null,
  modern_publishing: false,
  publishing_end_date: null,
  publishing_start_date: null,
  self_enrollment_enabled: true,
  self_enrollment_enabled_before_date: null,
  self_enrollment_restrict_to_institution: true,
  self_enrollment_use_enrollment_code: false,
  share_source_publicly: false,
  short_name: null,
  sync_errors: null,
  sync_job_sequence_id: null,
  sync_warnings: null,
  uuid: null,
};

// StudentCourseInstance omits some fields from StaffCourseInstance
const minimalStudentCourseInstance: z.input<typeof StudentCourseInstanceSchema> = {
  assessments_group_by: 'Set',
  course_id: '1',
  deleted_at: null,
  display_timezone: 'UTC',
  id: '3',
  long_name: null,
  modern_publishing: false,
  publishing_end_date: null,
  publishing_start_date: null,
  short_name: null,
};

const minimalStaffUser: z.input<typeof StaffUserSchema> = {
  email: 'a@b.com',
  id: '4',
  institution_id: '2',
  name: 'Test User',
  uid: 'u123@example.com',
  uin: '123456789',
};

// StudentUser omits uin and email. We're building this type to reflect
// information about one student that should be available to other students.
const minimalStudentUser: z.input<typeof StudentUserSchema> = {
  id: '4',
  institution_id: '2',
  name: 'Test User',
  uid: 'u123@example.com',
};

// Minimal valid data for each new schema
const minimalStaffAssessment: z.input<typeof StaffAssessmentSchema> = {
  advance_score_perc: null,
  allow_issue_reporting: null,
  allow_personal_notes: false,
  assessment_module_id: null,
  assessment_set_id: null,
  auto_close: null,
  config: null,
  constant_question_value: null,
  course_instance_id: '1',
  deleted_at: null,
  duration_stat_hist: [],
  duration_stat_max: 24 * 60 * 60 * 1000,
  duration_stat_mean: 24 * 60 * 60 * 1000,
  duration_stat_median: 24 * 60 * 60 * 1000,
  duration_stat_min: 24 * 60 * 60 * 1000,
  duration_stat_thresholds: [],
  honor_code: null,
  id: '2',
  json_allow_real_time_grading: null,
  json_can_submit: null,
  json_can_view: null,
  json_comment: null,
  json_grade_rate_minutes: null,
  max_bonus_points: null,
  max_points: null,
  modern_access_control: false,
  multiple_instance: false,
  number: 'A1',
  obj: null,
  order_by: null,
  require_honor_code: null,
  score_stat_hist: [],
  score_stat_max: 100,
  score_stat_mean: 80,
  score_stat_median: 80,
  score_stat_min: 0,
  score_stat_n_hundred: 1,
  score_stat_n_hundred_perc: 10,
  score_stat_n_zero: 0,
  score_stat_n_zero_perc: 0,
  score_stat_number: 10,
  score_stat_std: 5,
  share_source_publicly: false,
  shuffle_questions: null,
  statistics_last_updated_at: new Date(),
  stats_last_updated: null,
  sync_errors: null,
  sync_job_sequence_id: null,
  sync_warnings: null,
  team_work: false,
  text: null,
  tid: null,
  title: null,
  type: 'Exam',
  uuid: null,
};

const minimalStudentAssessment: z.input<typeof StudentAssessmentSchema> = {
  advance_score_perc: null,
  allow_issue_reporting: null,
  allow_personal_notes: false,
  assessment_module_id: null,
  assessment_set_id: null,
  auto_close: null,
  constant_question_value: null,
  course_instance_id: '1',
  deleted_at: null,
  honor_code: null,
  id: '2',
  max_bonus_points: null,
  max_points: null,
  multiple_instance: false,
  number: 'A1',
  require_honor_code: null,
  shuffle_questions: null,
  team_work: false,
  text: null,
  tid: null,
  title: null,
  type: 'Exam',
};

const minimalStaffAssessmentInstance: z.input<typeof StaffAssessmentInstanceSchema> = {
  assessment_id: '2',
  auth_user_id: null,
  auto_close: null,
  client_fingerprint_id_change_count: 0,
  closed_at: null,
  date: null,
  date_limit: null,
  duration: null,
  grading_needed: false,
  id: '3',
  include_in_statistics: false,
  last_client_fingerprint_id: null,
  max_bonus_points: null,
  max_points: null,
  mode: null,
  modified_at: new Date(),
  number: 1,
  open: null,
  points: null,
  score_perc: null,
  score_perc_pending: 0,
  team_id: null,
  user_id: null,
};

const minimalStudentAssessmentInstance: z.input<typeof StudentAssessmentInstanceSchema__UNSAFE> = {
  assessment_id: '2',
  auth_user_id: null,
  auto_close: null,
  closed_at: null,
  date: null,
  date_limit: null,
  duration: null,
  grading_needed: false,
  id: '3',
  max_bonus_points: null,
  max_points: null,
  mode: null,
  modified_at: new Date(),
  number: 1,
  open: null,
  points: null,
  score_perc: null,
  score_perc_pending: 0,
  team_id: null,
  user_id: null,
};

const minimalStaffAssessmentSet: z.input<typeof StaffAssessmentSetSchema> = {
  abbreviation: 'HW',
  color: 'blue',
  course_id: '1',
  heading: 'Homework',
  id: '4',
  implicit: false,
  json_comment: null,
  name: 'Homework',
  number: 1,
};

const minimalStudentAssessmentSet: z.input<typeof StudentAssessmentSetSchema> = {
  abbreviation: 'HW',
  color: 'blue',
  course_id: '1',
  heading: 'Homework',
  id: '4',
  implicit: false,
  name: 'Homework',
  number: 1,
};

const minimalRawStaffEnrollment: z.input<typeof RawStaffEnrollmentSchema> = {
  course_instance_id: '10',
  created_at: new Date(),
  first_joined_at: new Date(),
  id: '1',
  lti_managed: false,
  pending_lti13_email: null,
  pending_lti13_instance_id: null,
  pending_lti13_name: null,
  pending_lti13_sub: null,
  pending_uid: null,
  status: 'joined',
  user_id: '1',
};

const minimalStudentEnrollment: z.input<typeof RawStudentEnrollmentSchema> = {
  course_instance_id: '10',
  created_at: new Date(),
  first_joined_at: new Date(),
  id: '1',
  lti_managed: false,
  pending_uid: null,
  status: 'joined',
  user_id: null,
};

const minimalStaffAuditEvent: z.input<typeof StaffAuditEventSchema> = {
  action: 'insert',
  action_detail: null,
  agent_authn_user_id: null,
  agent_user_id: null,
  assessment_id: null,
  assessment_instance_id: null,
  assessment_question_id: null,
  context: {},
  course_id: null,
  course_instance_id: null,
  date: new Date(),
  enrollment_id: null,
  id: '5',
  institution_id: null,
  new_row: null,
  old_row: null,
  row_id: '6',
  subject_user_id: null,
  table_name: 'assessment_instances',
  team_id: null,
};

const minimalStaffAlternativeGroup: z.input<typeof StaffAlternativeGroupSchema> = {
  advance_score_perc: null,
  assessment_id: '2',
  id: '5',
  json_allow_real_time_grading: null,
  json_auto_points: null,
  json_can_submit: null,
  json_can_view: null,
  json_comment: null,
  json_force_max_points: null,
  json_grade_rate_minutes: null,
  json_has_alternatives: null,
  json_manual_points: null,
  json_max_auto_points: null,
  json_max_points: null,
  json_points: null,
  json_tries_per_variant: null,
  number: 1,
  number_choose: null,
  zone_id: '6',
};

const minimalStaffAssessmentQuestion: z.input<typeof StaffAssessmentQuestionSchema> = {
  advance_score_perc: null,
  ai_grading_mode: false,
  allow_real_time_grading: true,
  alternative_group_id: null,
  assessment_id: '2',
  average_average_submission_score: null,
  average_first_submission_score: null,
  average_last_submission_score: null,
  average_max_submission_score: null,
  average_number_submissions: null,
  average_submission_score_hist: null,
  average_submission_score_variance: null,
  deleted_at: null,
  discrimination: null,
  effective_advance_score_perc: null,
  first_submission_score_hist: null,
  first_submission_score_variance: null,
  force_max_points: null,
  grade_rate_minutes: null,
  id: '7',
  incremental_submission_points_array_averages: null,
  incremental_submission_points_array_variances: null,
  incremental_submission_score_array_averages: null,
  incremental_submission_score_array_variances: null,
  init_points: null,
  json_allow_real_time_grading: null,
  json_auto_points: null,
  json_comment: null,
  json_force_max_points: null,
  json_grade_rate_minutes: null,
  json_manual_points: null,
  json_max_auto_points: null,
  json_max_points: null,
  json_points: null,
  json_tries_per_variant: null,
  last_submission_score_hist: null,
  last_submission_score_variance: null,
  manual_rubric_id: null,
  max_auto_points: null,
  max_manual_points: null,
  max_points: null,
  max_submission_score_hist: null,
  max_submission_score_variance: null,
  mean_question_score: null,
  median_question_score: null,
  number: null,
  number_in_alternative_group: null,
  number_submissions_hist: null,
  number_submissions_variance: null,
  points_list: null,
  question_id: '8',
  question_score_variance: null,
  quintile_question_scores: null,
  some_nonzero_submission_perc: null,
  some_perfect_submission_perc: null,
  some_submission_perc: null,
  submission_score_array_averages: null,
  submission_score_array_variances: null,
  tries_per_variant: null,
};

const minimalStaffEnrollment: z.input<typeof StaffEnrollmentSchema> = {
  course_instance_id: '3',
  created_at: null,
  first_joined_at: null,
  id: '9',
  lti_managed: false,
  pending_lti13_email: null,
  pending_lti13_instance_id: null,
  pending_lti13_name: null,
  pending_lti13_sub: null,
  pending_uid: null,
  status: 'joined',
  user_id: null,
};

const minimalStaffInstitution: z.input<typeof StaffInstitutionSchema> = {
  default_authn_provider_id: null,
  display_timezone: 'UTC',
  id: '1',
  long_name: 'Test Institution',
  short_name: 'TI',
};

const minimalStaffQuestion: z.input<typeof StaffQuestionSchema> = {
  client_files: null,
  course_id: '1',
  deleted_at: null,
  dependencies: {},
  directory: null,
  draft: false,
  external_grading_enable_networking: null,
  external_grading_enabled: null,
  external_grading_entrypoint: null,
  external_grading_environment: {},
  external_grading_files: null,
  external_grading_image: null,
  external_grading_timeout: null,
  grading_method: 'Internal',
  id: '8',
  json_comment: null,
  json_external_grading_comment: null,
  json_workspace_comment: null,
  number: null,
  options: null,
  partial_credit: null,
  qid: null,
  share_publicly: false,
  share_source_publicly: false,
  show_correct_answer: null,
  single_variant: null,
  sync_errors: null,
  sync_job_sequence_id: null,
  sync_warnings: null,
  template_directory: null,
  title: null,
  topic_id: null,
  type: null,
  uuid: null,
  workspace_args: null,
  workspace_enable_networking: null,
  workspace_environment: null,
  workspace_graded_files: null,
  workspace_home: null,
  workspace_image: null,
  workspace_port: null,
  workspace_url_rewrite: null,
};

const minimalStaffTag: z.input<typeof StaffTagSchema> = {
  color: 'blue',
  course_id: '1',
  description: 'Test tag',
  id: '10',
  implicit: false,
  json_comment: null,
  name: 'Test Tag',
  number: 1,
};

const minimalStaffTopic: z.input<typeof StaffTopicSchema> = {
  color: 'green',
  course_id: '1',
  description: 'Test topic',
  id: '11',
  implicit: false,
  json_comment: null,
  name: 'Test Topic',
  number: 1,
};

const minimalStaffZone: z.input<typeof StaffZoneSchema> = {
  advance_score_perc: null,
  assessment_id: '2',
  best_questions: null,
  id: '6',
  json_allow_real_time_grading: null,
  json_can_submit: null,
  json_can_view: null,
  json_comment: null,
  json_grade_rate_minutes: null,
  lockpoint: false,
  max_points: null,
  number: 1,
  number_choose: null,
  title: null,
};

describe('safe-db-types schemas', () => {
  it('parses valid StaffCourse and drops extra fields', () => {
    const parsed = StaffCourseSchema.parse({ ...minimalStaffCourse, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStaffCourse);
  });

  it('parses valid StudentCourse and drops extra fields', () => {
    const parsed = StudentCourseSchema.parse({ ...minimalStudentCourse, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStudentCourse);
  });

  it('parses valid StaffCourseInstance and drops extra fields', () => {
    const parsed = StaffCourseInstanceSchema.parse({ ...minimalStaffCourseInstance, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStaffCourseInstance);
  });

  it('parses valid StudentCourseInstance and drops extra fields', () => {
    const parsed = StudentCourseInstanceSchema.parse({
      ...minimalStudentCourseInstance,
      extra: 123,
    });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStudentCourseInstance);
  });

  it('parses valid StaffUser and drops extra fields', () => {
    const parsed = StaffUserSchema.parse({ ...minimalStaffUser, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStaffUser);
  });

  it('parses valid StudentUser and drops extra fields', () => {
    const parsed = StudentUserSchema.parse({ ...minimalStudentUser, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStudentUser);
  });

  it('parses valid RawStaffEnrollment and drops extra fields', () => {
    const parsed = RawStaffEnrollmentSchema.parse({ ...minimalRawStaffEnrollment, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalRawStaffEnrollment);
  });

  it('parses valid RawStudentEnrollment and drops extra fields', () => {
    const parsed = RawStudentEnrollmentSchema.parse({ ...minimalStudentEnrollment, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStudentEnrollment);
  });

  it('rejects invalid RawStaffEnrollment status', () => {
    expect(() =>
      RawStaffEnrollmentSchema.parse({ ...minimalRawStaffEnrollment, status: 'invalid' as any }),
    ).toThrow();
  });

  it('parses valid StaffAssessment and drops extra fields', () => {
    const parsed = StaffAssessmentSchema.parse({ ...minimalStaffAssessment, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStaffAssessment);
  });

  it('parses valid StudentAssessment and drops extra fields', () => {
    const parsed = StudentAssessmentSchema.parse({ ...minimalStudentAssessment, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStudentAssessment);
  });

  it('parses valid StaffAssessmentInstance and drops extra fields', () => {
    const parsed = StaffAssessmentInstanceSchema.parse({
      ...minimalStaffAssessmentInstance,
      extra: 123,
    });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStaffAssessmentInstance);
  });

  it('parses valid StudentAssessmentInstance and drops extra fields', () => {
    const parsed = StudentAssessmentInstanceSchema__UNSAFE.parse({
      ...minimalStudentAssessmentInstance,
      extra: 123,
    });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStudentAssessmentInstance);
  });

  it('parses valid StaffAssessmentSet and drops extra fields', () => {
    const parsed = StaffAssessmentSetSchema.parse({ ...minimalStaffAssessmentSet, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStaffAssessmentSet);
  });

  it('parses valid StudentAssessmentSet and drops extra fields', () => {
    const parsed = StudentAssessmentSetSchema.parse({ ...minimalStudentAssessmentSet, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStudentAssessmentSet);
  });

  it('parses valid StaffAuditEvent and drops extra fields', () => {
    const parsed = StaffAuditEventSchema.parse({ ...minimalStaffAuditEvent, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStaffAuditEvent);
  });

  it('parses valid StaffAlternativeGroup and drops extra fields', () => {
    const parsed = StaffAlternativeGroupSchema.parse({
      ...minimalStaffAlternativeGroup,
      extra: 123,
    });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStaffAlternativeGroup);
  });

  it('parses valid StaffAssessmentQuestion and drops extra fields', () => {
    const parsed = StaffAssessmentQuestionSchema.parse({
      ...minimalStaffAssessmentQuestion,
      extra: 123,
    });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStaffAssessmentQuestion);
  });

  it('parses valid StaffEnrollment and drops extra fields', () => {
    const parsed = StaffEnrollmentSchema.parse({ ...minimalStaffEnrollment, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStaffEnrollment);
  });

  it('parses valid StaffInstitution and drops extra fields', () => {
    const parsed = StaffInstitutionSchema.parse({ ...minimalStaffInstitution, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStaffInstitution);
  });

  it('parses valid StaffQuestion and drops extra fields', () => {
    const parsed = StaffQuestionSchema.parse({ ...minimalStaffQuestion, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStaffQuestion);
  });

  it('parses valid StaffTag and drops extra fields', () => {
    const parsed = StaffTagSchema.parse({ ...minimalStaffTag, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStaffTag);
  });

  it('parses valid StaffTopic and drops extra fields', () => {
    const parsed = StaffTopicSchema.parse({ ...minimalStaffTopic, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStaffTopic);
  });

  it('parses valid StaffZone and drops extra fields', () => {
    const parsed = StaffZoneSchema.parse({ ...minimalStaffZone, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed).toMatchObject(minimalStaffZone);
  });
});
