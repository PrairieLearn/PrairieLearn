import { describe, expect, it } from 'vitest';

import {
  StaffCourseInstanceSchema,
  StaffCourseSchema,
  StaffUserSchema,
  StudentCourseInstanceSchema,
  StudentCourseSchema,
  StudentUserSchema,
} from './safe-db-types.js';

// Minimal valid data for each schema (with required fields only)
const minimalStaffCourse = {
  announcement_color: null,
  announcement_html: null,
  branch: 'main',
  commit_hash: null,
  course_instance_enrollment_limit: null,
  created_at: new Date().toISOString(),
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
const {
  announcement_color: _announcement_color,
  announcement_html: _announcement_html,
  branch: _branch,
  commit_hash: _commit_hash,
  course_instance_enrollment_limit: _course_instance_enrollment_limit,
  json_comment: _json_comment,
  path: _path,
  repository: _repository,
  sharing_name: _sharing_name,
  show_getting_started: _show_getting_started,
  sync_errors: _sync_errors,
  sync_job_sequence_id: _sync_job_sequence_id,
  sync_warnings: _sync_warnings,
  ...minimalStudentCourse
} = minimalStaffCourse;

const minimalStaffCourseInstance = {
  assessments_group_by: 'Set',
  course_id: '1',
  deleted_at: null,
  display_timezone: 'UTC',
  enrollment_limit: null,
  hide_in_enroll_page: null,
  id: '3',
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
const {
  enrollment_limit: _enrollment_limit,
  json_comment: __json_comment,
  share_source_publicly: _share_source_publicly,
  sync_errors: __sync_errors,
  sync_job_sequence_id: __sync_job_sequence_id,
  sync_warnings: __sync_warnings,
  uuid: _uuid,
  ...minimalStudentCourseInstance
} = minimalStaffCourseInstance;

const minimalStaffUser = {
  deleted_at: null,
  email: 'a@b.com',
  institution_id: '2',
  lti_context_id: null,
  lti_course_instance_id: null,
  lti_user_id: null,
  name: 'Test User',
  terms_accepted_at: null,
  uid: 'u123@example.com',
  uin: '123456789',
  user_id: '4',
};

// StudentUser omits uin
const { uin: _uin, ...minimalStudentUser } = minimalStaffUser;

describe('safe-db-types schemas', () => {
  it('parses valid StaffCourse and drops extra fields', () => {
    const parsed = StaffCourseSchema.parse({ ...minimalStaffCourse, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    const expected = { ...minimalStaffCourse, created_at: new Date(minimalStaffCourse.created_at) };
    expect(parsed).toMatchObject(expected);
  });

  it('parses valid StudentCourse and drops extra fields', () => {
    const parsed = StudentCourseSchema.parse({ ...minimalStudentCourse, extra: 123 });
    expect(parsed).not.toHaveProperty('extra');
    const expected = {
      ...minimalStudentCourse,
      created_at: new Date(minimalStudentCourse.created_at),
    };
    expect(parsed).toMatchObject(expected);
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
});
