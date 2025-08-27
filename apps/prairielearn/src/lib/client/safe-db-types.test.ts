import { describe, expect, it } from 'vitest';
import type z from 'zod';

import {
  StaffAssessmentInstanceSchema,
  StaffAssessmentSchema,
  StaffAssessmentSetSchema,
  StaffCourseInstanceSchema,
  StaffCourseSchema,
  StaffUserSchema,
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
  sync_warnings: null,
  sync_job_sequence_id: null,
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
  enrollment_limit: null,
  hide_in_enroll_page: null,
  id: '3',
  enrollment_code: '1234567890ab',
  json_comment: null,
  long_name: null,
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
  hide_in_enroll_page: null,
  id: '3',
  long_name: null,
  short_name: null,
};

const minimalStaffUser: z.input<typeof StaffUserSchema> = {
  email: 'a@b.com',
  institution_id: '2',
  name: 'Test User',
  uid: 'u123@example.com',
  uin: '123456789',
  user_id: '4',
};

// StudentUser omits uin and email. We're building this type to reflect
// information about one student that should be available to other students.
const minimalStudentUser: z.input<typeof StudentUserSchema> = {
  institution_id: '2',
  name: 'Test User',
  uid: 'u123@example.com',
  user_id: '4',
};

// Minimal valid data for each new schema
const minimalStaffAssessment: z.input<typeof StaffAssessmentSchema> = {
  allow_personal_notes: false,
  course_instance_id: '1',
  duration_stat_hist: [],
  duration_stat_max: 24 * 60 * 60 * 1000,
  duration_stat_mean: 24 * 60 * 60 * 1000,
  duration_stat_median: 24 * 60 * 60 * 1000,
  duration_stat_min: 24 * 60 * 60 * 1000,
  duration_stat_threshold_labels: [],
  duration_stat_threshold_seconds: [],
  duration_stat_thresholds: [],
  id: '2',
  number: 'A1',
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
  statistics_last_updated_at: new Date(),
  stats_last_updated: null,
  sync_errors: null,
  sync_job_sequence_id: null,
  sync_warnings: null,
  text: null,
  tid: null,
  title: null,
  uuid: null,
  deleted_at: null,
  type: 'Exam',
  json_comment: null,
  advance_score_perc: null,
  allow_issue_reporting: null,
  allow_real_time_grading: null,
  json_allow_real_time_grading: null,
  assessment_module_id: null,
  assessment_set_id: null,
  auto_close: null,
  config: null,
  constant_question_value: null,
  group_work: null,
  honor_code: null,
  json_grade_rate_minutes: null,
  json_can_view: null,
  json_can_submit: null,
  max_bonus_points: null,
  max_points: null,
  multiple_instance: null,
  obj: null,
  order_by: null,
  require_honor_code: null,
  shuffle_questions: null,
};

const minimalStudentAssessment: z.input<typeof StudentAssessmentSchema> = {
  allow_personal_notes: false,
  course_instance_id: '1',
  id: '2',
  number: 'A1',
  deleted_at: null,
  type: 'Exam',
  title: null,
  advance_score_perc: null,
  allow_issue_reporting: null,
  allow_real_time_grading: null,
  assessment_module_id: null,
  assessment_set_id: null,
  auto_close: null,
  constant_question_value: null,
  group_work: null,
  honor_code: null,
  max_bonus_points: null,
  max_points: null,
  multiple_instance: null,
  require_honor_code: null,
  shuffle_questions: null,
  text: null,
  tid: null,
};

const minimalStaffAssessmentInstance: z.input<typeof StaffAssessmentInstanceSchema> = {
  assessment_id: '2',
  client_fingerprint_id_change_count: 0,
  grading_needed: false,
  id: '3',
  include_in_statistics: false,
  modified_at: new Date(),
  auth_user_id: null,
  auto_close: null,
  closed_at: null,
  date: null,
  date_limit: null,
  duration: null,
  group_id: null,
  last_client_fingerprint_id: null,
  max_bonus_points: null,
  max_points: null,
  mode: null,
  number: null,
  open: null,
  points: null,
  score_perc: null,
  user_id: null,
};

const minimalStudentAssessmentInstance: z.input<typeof StudentAssessmentInstanceSchema__UNSAFE> = {
  assessment_id: '2',
  id: '3',
  number: null,
  date: null,
  user_id: null,
  auto_close: null,
  max_bonus_points: null,
  max_points: null,
  mode: null,
  open: null,
  points: null,
  score_perc: null,
  auth_user_id: null,
  closed_at: null,
  date_limit: null,
  duration: null,
  grading_needed: false,
  group_id: null,
  modified_at: new Date(),
};

const minimalStaffAssessmentSet: z.input<typeof StaffAssessmentSetSchema> = {
  abbreviation: 'HW',
  color: 'blue',
  course_id: '1',
  heading: 'Homework',
  id: '4',
  implicit: false,
  name: 'Homework',
  number: 1,
  json_comment: null,
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
});
