import { describe, expect, it } from 'vitest';
import type z from 'zod';

import {
  type StaffCourseInstanceContextSchema,
  type StudentCourseInstanceContextSchema,
  getCourseInstanceContext,
  getPageContext,
} from './page-context.js';

describe('getPageContext', () => {
  it('strips extra fields from the data', () => {
    const mockData = {
      authz_data: {
        has_course_instance_permission_edit: true,
        has_course_instance_permission_view: true,
        has_course_permission_own: true,
        user: { name: 'Test User', uid: 'test@illinois.edu', foo: 'bar' },
        mode: 'edit',
      },
      urlPrefix: '/pl/course/1/course_instance/1',
      access_as_administrator: false,
      authn_is_administrator: false,
      authn_user: { name: 'Test User', uid: 'test@illinois.edu', foo: 'bar' },
      extraField: 'this should be stripped',
      anotherExtraField: 123,
    };

    const expected = {
      authz_data: {
        has_course_instance_permission_edit: true,
        has_course_instance_permission_view: true,
        has_course_permission_own: true,
        user: { name: 'Test User', uid: 'test@illinois.edu' },
        mode: 'edit',
      },
      urlPrefix: '/pl/course/1/course_instance/1',
      access_as_administrator: false,
      authn_is_administrator: false,
      authn_user: { name: 'Test User', uid: 'test@illinois.edu' },
    };

    const result = getPageContext(mockData);

    expect(result).toEqual(expected);
  });

  it('throws error when required fields are missing', () => {
    const invalidData = {
      // Missing most fields
      authz_data: {
        has_course_instance_permission_edit: true,
      },
    };

    expect(() => getPageContext(invalidData)).toThrow();
  });
});

describe('getCourseInstanceContext', () => {
  const mockStudentData: z.input<typeof StudentCourseInstanceContextSchema> = {
    course_instance: {
      assessments_group_by: 'Set',
      course_id: '1',
      deleted_at: null,
      display_timezone: 'America/Chicago',
      hide_in_enroll_page: false,
      id: '1',
      long_name: 'Example Student Course Instance',
      short_name: 'Example Student Course',
    },
    course: {
      deleted_at: null,
      display_timezone: 'America/Chicago',
      id: '1',
      short_name: 'Example Student Course',
      created_at: new Date(),
      example_course: false,
      institution_id: '1',
      template_course: false,
      title: 'Example Student Course',
    },
  };
  const mockInstructorData: z.input<typeof StaffCourseInstanceContextSchema> = {
    course_instance: {
      ...mockStudentData.course_instance,
      enrollment_limit: 10,
      json_comment: 'foo',
      share_source_publicly: true,
      sync_errors: null,
      sync_job_sequence_id: null,
      sync_warnings: null,
      uuid: '1',
    },
    course: {
      ...mockStudentData.course,
      announcement_color: 'red',
      announcement_html: '<p>Hello, world!</p>',
      course_instance_enrollment_limit: 10,
      path: 'example/path',
      json_comment: null,
      sync_errors: null,
      sync_job_sequence_id: null,
      sync_warnings: null,
      branch: 'main',
      commit_hash: '1234567890',
      repository: 'https://github.com/example/example.git',
      sharing_name: 'example',
      show_getting_started: false,
    },
  };

  it('parses student context correctly', () => {
    const result = getCourseInstanceContext(mockStudentData, 'student');
    expect(result).toEqual(mockStudentData);
  });

  it('parses instructor context correctly', () => {
    const result = getCourseInstanceContext(mockInstructorData, 'instructor');
    expect(result).toEqual(mockInstructorData);
  });

  it('throws error for invalid student context', () => {
    const invalidData = { ...mockStudentData, course: { invalid_prop: true } };
    expect(() => getCourseInstanceContext(invalidData, 'student')).toThrow();
  });

  it('throws error for invalid instructor context', () => {
    const invalidData = { ...mockInstructorData, course_instance: { id: 3 } };
    expect(() => getCourseInstanceContext(invalidData, 'instructor')).toThrow();
  });

  it('strips extra fields from student context', () => {
    const studentDataWithExtra = {
      course_instance: { ...mockStudentData.course_instance, extra: 'field' },
      course: { ...mockStudentData.course, another: 'field' },
    };
    const result = getCourseInstanceContext(studentDataWithExtra, 'student');
    expect(result.course_instance).not.toHaveProperty('extra');
    expect(result.course).not.toHaveProperty('another');
  });

  it('strips extra fields from instructor context', () => {
    const instructorDataWithExtra = {
      course_instance: { ...mockInstructorData.course_instance, extra: 'field' },
      course: { ...mockInstructorData.course, another: 'field' },
    };
    const result = getCourseInstanceContext(instructorDataWithExtra, 'instructor');
    expect(result.course_instance).not.toHaveProperty('extra');
    expect(result.course).not.toHaveProperty('another');
  });
});
