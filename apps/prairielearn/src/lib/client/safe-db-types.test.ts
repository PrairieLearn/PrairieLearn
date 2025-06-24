import { describe, expect, it } from 'vitest';

import {
  type StaffCourse,
  StaffCourseInstanceSchema,
  StaffCourseSchema,
  type StaffUser,
  StaffUserSchema,
  type StudentCourse,
  type StudentCourseInstance,
  StudentCourseInstanceSchema,
  StudentCourseSchema,
  type StudentUser,
  StudentUserSchema,
} from './safe-db-types.js';

// Minimal valid data for each schema (with required fields only)
const minimalStaffCourse: StaffCourse = {
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
const minimalStudentCourse: StudentCourse = {
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
const minimalStudentCourseInstance: StudentCourseInstance = {
  assessments_group_by: 'Set',
  course_id: '1',
  deleted_at: null,
  display_timezone: 'UTC',
  hide_in_enroll_page: null,
  id: '3',
  long_name: null,
  short_name: null,
};

const minimalStaffUser: StaffUser = {
  email: 'a@b.com',
  institution_id: '2',
  name: 'Test User',
  uid: 'u123@example.com',
  uin: '123456789',
  user_id: '4',
};

// StudentUser omits uin
const minimalStudentUser: StudentUser = {
  email: 'a@b.com',
  institution_id: '2',
  name: 'Test User',
  uid: 'u123@example.com',
  user_id: '4',
};

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
