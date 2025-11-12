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

// Reusable test data
const TEST_USER = {
  name: 'Test User',
  uid: 'test@illinois.edu',
  email: 'test@illinois.edu',
  institution_id: '1',
  uin: '123456789',
  user_id: '1',
};

const TEST_INSTITUTION = {
  id: '1',
  display_timezone: 'America/Chicago',
  default_authn_provider_id: null,
  long_name: 'Example Institution',
  short_name: 'EI',
};

const createBaseContext = (overrides: Record<string, any> = {}) => ({
  __csrf_token: '123',
  plainUrlPrefix: '/pl',
  urlPrefix: '/pl/course/1/course_instance/1',
  authn_institution: TEST_INSTITUTION,
  authn_provider_name: 'local',
  authn_is_administrator: false,
  is_administrator: false,
  is_institution_administrator: false,
  news_item_notification_count: 0,
  navPage: 'home' as const,
  access_as_administrator: false,
  authn_user: TEST_USER,
  navbarType: 'student' as const,
  ...overrides,
});

const createInstructorAuthzData = (overrides: Record<string, any> = {}) => ({
  authn_user: TEST_USER,
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
  user: TEST_USER,
  ...overrides,
});

const createStudentAuthzData = (overrides: Record<string, any> = {}) => ({
  authn_user: TEST_USER,
  authn_is_administrator: false,
  authn_has_course_permission_preview: false,
  authn_has_course_permission_view: false,
  authn_has_course_permission_edit: false,
  authn_has_course_permission_own: false,
  authn_course_role: 'None',
  authn_course_instance_role: 'None',
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
  course_instance_role: 'None',
  mode: 'Public',
  has_student_access: true,
  has_student_access_with_enrollment: true,
  has_course_instance_permission_edit: false,
  has_course_instance_permission_view: false,
  user: TEST_USER,
  ...overrides,
});

const STUDENT_COURSE_INSTANCE = {
  assessments_group_by: 'Set' as const,
  course_id: '1',
  deleted_at: null,
  display_timezone: 'America/Chicago',
  hide_in_enroll_page: false,
  id: '1',
  long_name: 'Example Student Course Instance',
  short_name: 'Example Student Course',
  publishing_end_date: null,
  publishing_start_date: null,
};

const STUDENT_COURSE = {
  deleted_at: null,
  display_timezone: 'America/Chicago',
  id: '1',
  short_name: 'Example Student Course',
  created_at: new Date(),
  example_course: false,
  institution_id: '1',
  template_course: false,
  title: 'Example Student Course',
};

const mockStudentData: z.input<typeof StudentCourseInstanceContextSchema> = {
  course_instance: STUDENT_COURSE_INSTANCE,
  course: STUDENT_COURSE,
  has_enhanced_navigation: false,
};

const mockInstructorData: z.input<typeof StaffCourseInstanceContextSchema> = {
  course_instance: {
    ...STUDENT_COURSE_INSTANCE,
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
    ...STUDENT_COURSE,
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
  institution: TEST_INSTITUTION,
  has_enhanced_navigation: false,
};

const STAFF_ASSESSMENT_SET = {
  abbreviation: 'HW',
  color: 'green',
  course_id: '1',
  heading: 'Homework',
  id: '1',
  implicit: false,
  json_comment: null,
  name: 'Homework',
  number: 1,
};

const STAFF_ASSESSMENT = {
  advance_score_perc: null,
  allow_issue_reporting: true,
  allow_personal_notes: true,
  assessment_module_id: null,
  assessment_set_id: '1',
  auto_close: false,
  config: null,
  constant_question_value: false,
  course_instance_id: '1',
  deleted_at: null,
  duration_stat_hist: [],
  duration_stat_max: '01:00:00',
  duration_stat_mean: '00:30:00',
  duration_stat_median: '00:30:00',
  duration_stat_min: '00:10:00',
  duration_stat_thresholds: [],
  group_work: false,
  honor_code: null,
  id: '1',
  json_allow_real_time_grading: true,
  json_can_submit: null,
  json_can_view: null,
  json_comment: null,
  json_grade_rate_minutes: null,
  max_bonus_points: null,
  max_points: 100,
  modern_access_control: true,
  multiple_instance: false,
  number: '1',
  obj: null,
  order_by: 1,
  require_honor_code: false,
  score_stat_hist: [],
  score_stat_max: 100,
  score_stat_mean: 75,
  score_stat_median: 75,
  score_stat_min: 0,
  score_stat_n_hundred: 10,
  score_stat_n_hundred_perc: 20,
  score_stat_n_zero: 5,
  score_stat_n_zero_perc: 10,
  score_stat_number: 50,
  score_stat_std: 15,
  share_source_publicly: false,
  shuffle_questions: true,
  statistics_last_updated_at: new Date(),
  stats_last_updated: new Date(),
  sync_errors: null,
  sync_job_sequence_id: null,
  sync_warnings: null,
  text: 'Assessment text',
  tid: 'hw1',
  title: 'Homework 1',
  type: 'Homework',
  uuid: 'uuid-123',
};

const mockAssessmentData = {
  ...mockInstructorData,
  assessment: STAFF_ASSESSMENT,
  assessment_set: STAFF_ASSESSMENT_SET,
};
describe('extractPageContext', () => {
  it('strips extra fields from the data for plain pageType', () => {
    const mockData = {
      authz_data: createInstructorAuthzData({
        authn_user: { ...TEST_USER, foo: 'bar' },
        user: { ...TEST_USER, foo: 'bar' },
      }),
      ...createBaseContext({ plainUrlPrefix: undefined }),
      authn_user: { ...TEST_USER, foo: 'bar' },
      extraField: 'this should be stripped',
      anotherExtraField: 123,
    };

    const expected: z.infer<typeof RawStaffPlainPageContextWithAuthzDataSchema> = {
      authz_data: createInstructorAuthzData({
        authn_user: TEST_USER as StaffUser,
        user: TEST_USER as StaffUser,
      }) as PageAuthzData,
      ...createBaseContext({ plainUrlPrefix: undefined }),
      authn_user: TEST_USER as StaffUser,
      authn_institution: TEST_INSTITUTION as StaffInstitution,
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
    const mockData = createBaseContext({ urlPrefix: '/pl/course/1' });

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
  it('parses student context correctly and includes base context', () => {
    const mockDataWithBase = {
      ...mockStudentData,
      ...createBaseContext(),
      authz_data: createStudentAuthzData(),
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
      ...createBaseContext({ navbarType: 'instructor' }),
      authz_data: createInstructorAuthzData(),
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
      ...createBaseContext(),
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
      ...createBaseContext({ navbarType: 'instructor' }),
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
      ...createBaseContext(),
      authz_data: createStudentAuthzData(),
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
      ...createBaseContext({ navbarType: 'instructor' }),
      authz_data: createInstructorAuthzData(),
    };

    const result = extractPageContext(instructorDataWithExtra, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });
    expect(result.course_instance).not.toHaveProperty('extra');
    expect(result.course).not.toHaveProperty('another');
  });
});

describe('extractPageContext with assessment pageType', () => {
  it('parses assessment context correctly and includes base context', () => {
    const mockDataWithBase = {
      ...mockAssessmentData,
      ...createBaseContext({ navbarType: 'instructor' }),
      authz_data: createInstructorAuthzData(),
    };

    const result = extractPageContext(mockDataWithBase, {
      pageType: 'assessment',
      accessType: 'instructor',
    });

    expect(result).toHaveProperty('course_instance');
    expect(result).toHaveProperty('course');
    expect(result).toHaveProperty('institution');
    expect(result).toHaveProperty('assessment');
    expect(result).toHaveProperty('assessment_set');
    expect(result).toHaveProperty('__csrf_token');
    expect(result).toHaveProperty('authz_data');
    expect(result.assessment.type).toBe('Homework');
    expect(result.assessment_set.name).toBe('Homework');
  });

  it('throws error for invalid assessment context', () => {
    const invalidData = {
      ...mockAssessmentData,
      assessment: { id: '1' }, // Missing required fields
      ...createBaseContext({ navbarType: 'instructor' }),
    };

    expect(() =>
      extractPageContext(invalidData, {
        pageType: 'assessment',
        accessType: 'instructor',
      }),
    ).toThrow();
  });

  it('strips extra fields from assessment context', () => {
    const assessmentDataWithExtra = {
      ...mockAssessmentData,
      assessment: { ...STAFF_ASSESSMENT, extra: 'field' },
      assessment_set: { ...STAFF_ASSESSMENT_SET, another: 'field' },
      ...createBaseContext({ navbarType: 'instructor' }),
      authz_data: createInstructorAuthzData(),
    };

    const result = extractPageContext(assessmentDataWithExtra, {
      pageType: 'assessment',
      accessType: 'instructor',
    });
    expect(result.assessment).not.toHaveProperty('extra');
    expect(result.assessment_set).not.toHaveProperty('another');
  });

  it('throws error with accessType student for assessment context', () => {
    const studentData = {
      ...mockAssessmentData,
      ...createBaseContext(),
      authz_data: createStudentAuthzData(),
    };

    expect(() =>
      extractPageContext(studentData, {
        pageType: 'assessment',
        accessType: 'student',
      }),
    ).toThrow();
  });
});
