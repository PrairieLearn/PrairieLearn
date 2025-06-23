import { describe, expect, it } from 'vitest';

import { getCourseInstanceContext, getPageContext } from './page-context.js';

describe('getPageContext', () => {
  it('strips extra fields from the data', () => {
    const mockData = {
      authz_data: {
        has_course_instance_permission_edit: true,
        has_course_instance_permission_view: true,
        has_course_permission_own: true,
        user: { name: 'Test User', uid: 'test@illinois.edu' },
        mode: 'edit',
      },
      urlPrefix: '/pl/course/1/course_instance/1',
      access_as_administrator: false,
      news_item_notification_count: 0,
      authn_is_administrator: false,
      authn_user: { name: 'Test User', uid: 'test@illinois.edu' },
      viewType: 'instructor',
      extraField: 'this should be stripped',
      anotherExtraField: 123,
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { extraField, anotherExtraField, ...expected } = mockData;

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
  /*
      assessments_group_by: "Set" | "Module";
    course_id: string;
    deleted_at: Date | null;
    display_timezone: string;
    hide_in_enroll_page: boolean | null;
    id: string;
    json_comment: string | ... 2 more ... | null;
    long_name: string | null;
    share_source_publicly: boolean;
    short_name: string | null;
    uuid: string | null;
  */
  const mockStudentData = {
    course_instance: {
      announcement_color: 'red',
      assessments_group_by: 'Set',
      course_id: '1',
      deleted_at: null,
      display_timezone: 'America/Chicago',
      hide_in_enroll_page: false,
      id: '1',
      json_comment: null,
      long_name: 'Example Student Course Instance',
      share_source_publicly: true,
      short_name: 'Example Student Course',
      uuid: '1',
    },
    course: {
      assessments_group_by: 'Set',
      course_id: '1',
      deleted_at: null,
      display_timezone: 'America/Chicago',
      hide_in_enroll_page: false,
      id: '1',
      json_comment: null,
      long_name: 'Example Student Course',
      share_source_publicly: true,
      short_name: 'Example Student Course',
      uuid: '1',
    },
  };

  const mockInstructorData = {
    course_instance: {
      announcement_color: 'red',
      assessments_group_by: 'Set',
      course_id: '2',
      deleted_at: null,
      display_timezone: 'America/Chicago',
      hide_in_enroll_page: false,
      id: '2',
      json_comment: null,
      long_name: 'Example Instructor Course Instance',
      share_source_publicly: true,
      short_name: 'Example Instructor Course',
      uuid: '2',
    },
    course: {
      assessments_group_by: 'Set',
      course_id: '2',
      deleted_at: null,
      display_timezone: 'America/Chicago',
      hide_in_enroll_page: false,
      id: '2',
      json_comment: null,
      long_name: 'Example Instructor Course',
      share_source_publicly: true,
      short_name: 'Example Instructor Course',
      uuid: '2',
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
