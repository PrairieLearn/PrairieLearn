import { describe, expect, it } from 'vitest';

import { getPageContext, getCourseInstanceContext } from './page-context.js';

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

    const result = getPageContext(mockData);

    expect(result).toEqual({
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
    });

    expect(result).not.toHaveProperty('extraField');
    expect(result).not.toHaveProperty('anotherExtraField');
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
  const mockStudentData = {
    course_instance: { id: '1', long_name: 'Example Student Course Instance' },
    course: { id: '1', short_name: 'Example Student Course' },
  };

  const mockInstructorData = {
    course_instance: { id: '2', long_name: 'Example Instructor Course Instance' },
    course: { id: '2', short_name: 'Example Instructor Course' },
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
