import { describe, expect, it } from 'vitest';
import { type z } from 'zod';

import type { PageAuthzData } from '../authz-data-lib.js';

import {
  type RawStaffPlainPageContextWithAuthzDataSchema,
  type StaffCourseInstanceContextSchema,
  type StudentCourseInstanceContextSchema,
  extractPageContext,
} from './page-context.js';
import type { StaffInstitution, StaffUser } from './safe-db-types.js';

describe('extractPageContext', () => {
  it('strips extra fields from the data for plain pageType', () => {
    const mockData = {
      authz_data: {
        authn_user: {
          name: 'Test User',
          uid: 'test@illinois.edu',
          email: 'test@illinois.edu',
          institution_id: '1',
          uin: '123456789',
          user_id: '1',
          foo: 'bar',
        },
        authn_is_administrator: false,
        authn_has_course_permission_preview: true,
        authn_has_course_permission_view: true,
        authn_has_course_permission_edit: true,
        authn_has_course_permission_own: true,
        authn_course_role: 'Owner',
        authn_course_instance_role: 'Student Data Editor',
        authn_mode: 'Public',
        authn_has_student_access: false,
        authn_has_student_access_with_enrollment: false,
        authn_has_course_instance_permission_view: true,
        authn_has_course_instance_permission_edit: true,
        is_administrator: false,
        has_course_permission_preview: true,
        has_course_permission_view: true,
        has_course_permission_edit: true,
        has_course_permission_own: true,
        course_role: 'Owner',
        course_instance_role: 'Student Data Editor',
        mode: 'Public',
        has_student_access: false,
        has_student_access_with_enrollment: false,
        has_course_instance_permission_edit: true,
        has_course_instance_permission_view: true,
        user: {
          name: 'Test User',
          uid: 'test@illinois.edu',
          email: 'test@illinois.edu',
          institution_id: '1',
          uin: '123456789',
          user_id: '1',
          foo: 'bar',
        },
      },
      __csrf_token: '123',
      urlPrefix: '/pl/course/1/course_instance/1',
      authn_institution: {
        id: '1',
        display_timezone: 'America/Chicago',
        default_authn_provider_id: null,
        long_name: 'Example Institution',
        short_name: 'EI',
      },
      authn_provider_name: 'local',
      authn_is_administrator: false,
      is_administrator: false,
      is_institution_administrator: false,
      news_item_notification_count: 0,
      navPage: 'home',
      access_as_administrator: false,
      authn_user: {
        name: 'Test User',
        uid: 'test@illinois.edu',
        email: 'test@illinois.edu',
        institution_id: '1',
        uin: '123456789',
        user_id: '1',
        foo: 'bar',
      },
      navbarType: 'student',
      extraField: 'this should be stripped',
      anotherExtraField: 123,
    };

    const expected: z.infer<typeof RawStaffPlainPageContextWithAuthzDataSchema> = {
      authz_data: {
        authn_user: {
          name: 'Test User',
          uid: 'test@illinois.edu',
          email: 'test@illinois.edu',
          institution_id: '1',
          uin: '123456789',
          user_id: '1',
        } as StaffUser,
        authn_is_administrator: false,
        authn_has_course_permission_preview: true,
        authn_has_course_permission_view: true,
        authn_has_course_permission_edit: true,
        authn_has_course_permission_own: true,
        authn_course_role: 'Owner',
        authn_course_instance_role: 'Student Data Editor',
        authn_mode: 'Public',
        authn_has_student_access: false,
        authn_has_student_access_with_enrollment: false,
        authn_has_course_instance_permission_view: true,
        authn_has_course_instance_permission_edit: true,
        is_administrator: false,
        has_course_permission_preview: true,
        has_course_permission_view: true,
        has_course_permission_edit: true,
        has_course_permission_own: true,
        course_role: 'Owner',
        course_instance_role: 'Student Data Editor',
        mode: 'Public',
        has_student_access: false,
        has_student_access_with_enrollment: false,
        has_course_instance_permission_edit: true,
        has_course_instance_permission_view: true,
        user: {
          name: 'Test User',
          uid: 'test@illinois.edu',
          email: 'test@illinois.edu',
          institution_id: '1',
          uin: '123456789',
          user_id: '1',
        } as StaffUser,
      } as PageAuthzData,
      __csrf_token: '123',
      urlPrefix: '/pl/course/1/course_instance/1',
      authn_institution: {
        id: '1',
        display_timezone: 'America/Chicago',
        default_authn_provider_id: null,
        long_name: 'Example Institution',
        short_name: 'EI',
      } as StaffInstitution,
      authn_provider_name: 'local',
      authn_is_administrator: false,
      access_as_administrator: false,
      is_administrator: false,
      is_institution_administrator: false,
      news_item_notification_count: 0,
      navPage: 'home',
      authn_user: {
        name: 'Test User',
        uid: 'test@illinois.edu',
        email: 'test@illinois.edu',
        institution_id: '1',
        uin: '123456789',
        user_id: '1',
      } as StaffUser,
      navbarType: 'student',
    };

    const result = extractPageContext(mockData, {
      pageType: 'plain',
      accessType: 'instructor',
    });

    expect(result).toEqual(expected);
  });

  it('throws error when required fields are missing', () => {
    const invalidData = {
      // Missing most fields
      authz_data: {
        has_course_instance_permission_edit: true,
        // Missing required fields like authn_is_administrator, is_administrator, user, etc.
      },
    };

    expect(() =>
      extractPageContext(invalidData, {
        pageType: 'plain',
        accessType: 'instructor',
      }),
    ).toThrow();
  });

  it('returns plain context without authz data when withAuthzData is false', () => {
    const mockData = {
      __csrf_token: '123',
      plainUrlPrefix: '/pl',
      urlPrefix: '/pl/course/1',
      authn_institution: {
        id: '1',
        display_timezone: 'America/Chicago',
        default_authn_provider_id: null,
        long_name: 'Example Institution',
        short_name: 'EI',
      },
      authn_provider_name: 'local',
      authn_is_administrator: false,
      is_administrator: false,
      is_institution_administrator: false,
      news_item_notification_count: 0,
      navPage: 'home',
      access_as_administrator: false,
      authn_user: {
        name: 'Test User',
        uid: 'test@illinois.edu',
        email: 'test@illinois.edu',
        institution_id: '1',
        uin: '123456789',
        user_id: '1',
      },
      navbarType: 'student',
    };

    const result = extractPageContext(mockData, {
      pageType: 'plain',
      accessType: 'student',
      withAuthzData: false,
    });

    expect(result).not.toHaveProperty('authz_data');
    expect(result.__csrf_token).toBe('123');
  });
});

describe('extractPageContext with courseInstance pageType', () => {
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
      publishing_end_date: null,
      publishing_start_date: null,
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
    has_enhanced_navigation: false,
  };
  const mockInstructorData: z.input<typeof StaffCourseInstanceContextSchema> = {
    course_instance: {
      ...mockStudentData.course_instance,
      enrollment_code: 'AAABBBDDDD',
      enrollment_limit: 10,
      json_comment: 'foo',
      share_source_publicly: true,
      self_enrollment_enabled: true,
      self_enrollment_use_enrollment_code: false,
      self_enrollment_restrict_to_institution: true,
      self_enrollment_enabled_before_date: null,
      modern_publishing: false,
      publishing_end_date: null,
      publishing_start_date: null,
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
    institution: {
      id: '1',
      display_timezone: 'America/Chicago',
      default_authn_provider_id: null,
      long_name: 'Example Institution',
      short_name: 'EI',
    },
    has_enhanced_navigation: false,
  };

  it('parses student context correctly and includes base context', () => {
    const mockDataWithBase = {
      ...mockStudentData,
      __csrf_token: '123',
      plainUrlPrefix: '/pl',
      urlPrefix: '/pl/course/1/course_instance/1',
      authn_institution: {
        id: '1',
        display_timezone: 'America/Chicago',
        default_authn_provider_id: null,
        long_name: 'Example Institution',
        short_name: 'EI',
      },
      authn_provider_name: 'local',
      authn_is_administrator: false,
      is_administrator: false,
      is_institution_administrator: false,
      news_item_notification_count: 0,
      navPage: 'home',
      access_as_administrator: false,
      authn_user: {
        name: 'Test User',
        uid: 'test@illinois.edu',
        email: 'test@illinois.edu',
        institution_id: '1',
        uin: '123456789',
        user_id: '1',
      },
      navbarType: 'student',
      authz_data: {
        authn_user: {
          name: 'Test User',
          uid: 'test@illinois.edu',
          email: 'test@illinois.edu',
          institution_id: '1',
          uin: '123456789',
          user_id: '1',
        },
        authn_is_administrator: false,
        authn_has_course_permission_preview: false,
        authn_has_course_permission_view: false,
        authn_has_course_permission_edit: false,
        authn_has_course_permission_own: false,
        authn_course_role: 'None',
        authn_course_instance_role: 'Student',
        authn_mode: 'Public',
        authn_has_student_access: true,
        authn_has_student_access_with_enrollment: true,
        authn_has_course_instance_permission_view: false,
        authn_has_course_instance_permission_edit: false,
        is_administrator: false,
        has_course_permission_preview: false,
        has_course_permission_view: false,
        has_course_permission_edit: false,
        has_course_permission_own: false,
        course_role: 'None',
        course_instance_role: 'Student',
        mode: 'Public',
        has_student_access: true,
        has_student_access_with_enrollment: true,
        has_course_instance_permission_edit: false,
        has_course_instance_permission_view: false,
        user: {
          name: 'Test User',
          uid: 'test@illinois.edu',
          email: 'test@illinois.edu',
          institution_id: '1',
          uin: '123456789',
          user_id: '1',
        },
      },
    };

    const result = extractPageContext(mockDataWithBase, {
      pageType: 'courseInstance',
      accessType: 'student',
    });

    expect(result).toHaveProperty('course_instance');
    expect(result).toHaveProperty('course');
    expect(result).toHaveProperty('__csrf_token');
    expect(result).toHaveProperty('authz_data');
  });

  it('parses instructor context correctly and includes base context', () => {
    const mockDataWithBase = {
      ...mockInstructorData,
      __csrf_token: '123',
      plainUrlPrefix: '/pl',
      urlPrefix: '/pl/course/1/course_instance/1',
      authn_provider_name: 'local',
      authn_is_administrator: false,
      is_administrator: false,
      is_institution_administrator: false,
      news_item_notification_count: 0,
      navPage: 'home',
      access_as_administrator: false,
      authn_user: {
        name: 'Test User',
        uid: 'test@illinois.edu',
        email: 'test@illinois.edu',
        institution_id: '1',
        uin: '123456789',
        user_id: '1',
      },
      navbarType: 'instructor',
      authn_institution: mockInstructorData.institution,
      authz_data: {
        authn_user: {
          name: 'Test User',
          uid: 'test@illinois.edu',
          email: 'test@illinois.edu',
          institution_id: '1',
          uin: '123456789',
          user_id: '1',
        },
        authn_is_administrator: false,
        authn_has_course_permission_preview: true,
        authn_has_course_permission_view: true,
        authn_has_course_permission_edit: true,
        authn_has_course_permission_own: true,
        authn_course_role: 'Owner',
        authn_course_instance_role: 'Instructor',
        authn_mode: 'Public',
        authn_has_student_access: false,
        authn_has_student_access_with_enrollment: false,
        authn_has_course_instance_permission_view: true,
        authn_has_course_instance_permission_edit: true,
        is_administrator: false,
        has_course_permission_preview: true,
        has_course_permission_view: true,
        has_course_permission_edit: true,
        has_course_permission_own: true,
        course_role: 'Owner',
        course_instance_role: 'Instructor',
        mode: 'Public',
        has_student_access: false,
        has_student_access_with_enrollment: false,
        has_course_instance_permission_edit: true,
        has_course_instance_permission_view: true,
        user: {
          name: 'Test User',
          uid: 'test@illinois.edu',
          email: 'test@illinois.edu',
          institution_id: '1',
          uin: '123456789',
          user_id: '1',
        },
      },
    };

    const result = extractPageContext(mockDataWithBase, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });

    expect(result).toHaveProperty('course_instance');
    expect(result).toHaveProperty('course');
    expect(result).toHaveProperty('institution');
    expect(result).toHaveProperty('__csrf_token');
    expect(result).toHaveProperty('authz_data');
  });

  it('throws error for invalid student context', () => {
    const invalidData = {
      ...mockStudentData,
      course: { invalid_prop: true },
      __csrf_token: '123',
      plainUrlPrefix: '/pl',
      urlPrefix: '/pl/course/1/course_instance/1',
      authn_institution: {
        id: '1',
        display_timezone: 'America/Chicago',
        default_authn_provider_id: null,
        long_name: 'Example Institution',
        short_name: 'EI',
      },
      authn_provider_name: 'local',
      authn_is_administrator: false,
      is_administrator: false,
      is_institution_administrator: false,
      news_item_notification_count: 0,
      navPage: 'home',
      access_as_administrator: false,
      authn_user: {
        name: 'Test User',
        uid: 'test@illinois.edu',
        email: 'test@illinois.edu',
        institution_id: '1',
        uin: '123456789',
        user_id: '1',
      },
      navbarType: 'student',
    };

    expect(() =>
      extractPageContext(invalidData, {
        pageType: 'courseInstance',
        accessType: 'student',
      }),
    ).toThrow();
  });

  it('throws error for invalid instructor context', () => {
    const invalidData = {
      ...mockInstructorData,
      course_instance: { id: 3 },
      __csrf_token: '123',
      plainUrlPrefix: '/pl',
      urlPrefix: '/pl/course/1/course_instance/1',
      authn_provider_name: 'local',
      authn_is_administrator: false,
      is_administrator: false,
      is_institution_administrator: false,
      news_item_notification_count: 0,
      navPage: 'home',
      access_as_administrator: false,
      authn_user: {
        name: 'Test User',
        uid: 'test@illinois.edu',
        email: 'test@illinois.edu',
        institution_id: '1',
        uin: '123456789',
        user_id: '1',
      },
      navbarType: 'instructor',
    };

    expect(() =>
      extractPageContext(invalidData, {
        pageType: 'courseInstance',
        accessType: 'instructor',
      }),
    ).toThrow();
  });

  it('strips extra fields from student context', () => {
    const studentDataWithExtra = {
      course_instance: { ...mockStudentData.course_instance, extra: 'field' },
      course: { ...mockStudentData.course, another: 'field' },
      has_enhanced_navigation: false,
      __csrf_token: '123',
      plainUrlPrefix: '/pl',
      urlPrefix: '/pl/course/1/course_instance/1',
      authn_institution: {
        id: '1',
        display_timezone: 'America/Chicago',
        default_authn_provider_id: null,
        long_name: 'Example Institution',
        short_name: 'EI',
      },
      authn_provider_name: 'local',
      authn_is_administrator: false,
      is_administrator: false,
      is_institution_administrator: false,
      news_item_notification_count: 0,
      navPage: 'home',
      access_as_administrator: false,
      authn_user: {
        name: 'Test User',
        uid: 'test@illinois.edu',
        email: 'test@illinois.edu',
        institution_id: '1',
        uin: '123456789',
        user_id: '1',
      },
      navbarType: 'student',
      authz_data: {
        authn_user: {
          name: 'Test User',
          uid: 'test@illinois.edu',
          email: 'test@illinois.edu',
          institution_id: '1',
          uin: '123456789',
          user_id: '1',
        },
        authn_is_administrator: false,
        authn_has_course_permission_preview: false,
        authn_has_course_permission_view: false,
        authn_has_course_permission_edit: false,
        authn_has_course_permission_own: false,
        authn_course_role: 'None',
        authn_course_instance_role: 'Student',
        authn_mode: 'Public',
        authn_has_student_access: true,
        authn_has_student_access_with_enrollment: true,
        authn_has_course_instance_permission_view: false,
        authn_has_course_instance_permission_edit: false,
        is_administrator: false,
        has_course_permission_preview: false,
        has_course_permission_view: false,
        has_course_permission_edit: false,
        has_course_permission_own: false,
        course_role: 'None',
        course_instance_role: 'Student',
        mode: 'Public',
        has_student_access: true,
        has_student_access_with_enrollment: true,
        has_course_instance_permission_edit: false,
        has_course_instance_permission_view: false,
        user: {
          name: 'Test User',
          uid: 'test@illinois.edu',
          email: 'test@illinois.edu',
          institution_id: '1',
          uin: '123456789',
          user_id: '1',
        },
      },
    };

    const result = extractPageContext(studentDataWithExtra, {
      pageType: 'courseInstance',
      accessType: 'student',
    });
    expect(result.course_instance).not.toHaveProperty('extra');
    expect(result.course).not.toHaveProperty('another');
  });

  it('strips extra fields from instructor context', () => {
    const instructorDataWithExtra = {
      course_instance: { ...mockInstructorData.course_instance, extra: 'field' },
      course: { ...mockInstructorData.course, another: 'field' },
      institution: { ...mockInstructorData.institution, extra: 'field' },
      has_enhanced_navigation: false,
      __csrf_token: '123',
      plainUrlPrefix: '/pl',
      urlPrefix: '/pl/course/1/course_instance/1',
      authn_provider_name: 'local',
      authn_is_administrator: false,
      is_administrator: false,
      is_institution_administrator: false,
      news_item_notification_count: 0,
      navPage: 'home',
      access_as_administrator: false,
      authn_user: {
        name: 'Test User',
        uid: 'test@illinois.edu',
        email: 'test@illinois.edu',
        institution_id: '1',
        uin: '123456789',
        user_id: '1',
      },
      navbarType: 'instructor',
      authn_institution: mockInstructorData.institution,
      authz_data: {
        authn_user: {
          name: 'Test User',
          uid: 'test@illinois.edu',
          email: 'test@illinois.edu',
          institution_id: '1',
          uin: '123456789',
          user_id: '1',
        },
        authn_is_administrator: false,
        authn_has_course_permission_preview: true,
        authn_has_course_permission_view: true,
        authn_has_course_permission_edit: true,
        authn_has_course_permission_own: true,
        authn_course_role: 'Owner',
        authn_course_instance_role: 'Instructor',
        authn_mode: 'Public',
        authn_has_student_access: false,
        authn_has_student_access_with_enrollment: false,
        authn_has_course_instance_permission_view: true,
        authn_has_course_instance_permission_edit: true,
        is_administrator: false,
        has_course_permission_preview: true,
        has_course_permission_view: true,
        has_course_permission_edit: true,
        has_course_permission_own: true,
        course_role: 'Owner',
        course_instance_role: 'Instructor',
        mode: 'Public',
        has_student_access: false,
        has_student_access_with_enrollment: false,
        has_course_instance_permission_edit: true,
        has_course_instance_permission_view: true,
        user: {
          name: 'Test User',
          uid: 'test@illinois.edu',
          email: 'test@illinois.edu',
          institution_id: '1',
          uin: '123456789',
          user_id: '1',
        },
      },
    };

    const result = extractPageContext(instructorDataWithExtra, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });
    expect(result.course_instance).not.toHaveProperty('extra');
    expect(result.course).not.toHaveProperty('another');
  });
});
