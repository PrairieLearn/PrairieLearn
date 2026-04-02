import { afterAll, assert, beforeAll, beforeEach, describe, it, vi } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import * as publishingExtensionsModel from '../models/course-instance-publishing-extensions.js';
import * as enrollmentModel from '../models/enrollment.js';
import * as helperDb from '../tests/helperDb.js';

import {
  calculateModernCourseInstanceStudentAccess,
  checkCourseInstanceLegacyAccess,
} from './authz-data.js';
import type { CourseInstance, CourseInstancePublishingExtension, Enrollment } from './db-types.js';

const sql = loadSqlEquiv(import.meta.url);

describe('calculateModernCourseInstanceStudentAccess', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function createMockCourseInstance(overrides: Partial<CourseInstance> = {}): CourseInstance {
    return {
      id: 'test-course-instance-id',
      ai_grading_use_custom_api_keys: false,
      course_id: 'test-course-id',
      credit_non_transferable_milli_dollars: 0,
      credit_transferable_milli_dollars: 0,
      short_name: 'Test',
      long_name: 'Test Course Instance',
      display_timezone: 'America/Chicago',
      modern_publishing: true,
      publishing_start_date: new Date('2025-01-01T00:00:00Z'),
      publishing_end_date: new Date('2025-12-31T23:59:59Z'),
      assessments_group_by: 'Set',
      deleted_at: null,
      enrollment_code: 'TEST123',
      enrollment_limit: null,
      json_comment: null,
      self_enrollment_enabled: true,
      self_enrollment_enabled_before_date: null,
      self_enrollment_restrict_to_institution: false,
      self_enrollment_use_enrollment_code: false,
      share_source_publicly: false,
      sync_errors: null,
      sync_job_sequence_id: null,
      sync_warnings: null,
      uuid: 'test-uuid',
      ...overrides,
    };
  }

  function createMockEnrollment(overrides: Partial<Enrollment> = {}): Enrollment {
    return {
      id: 'test-enrollment-id',
      user_id: 'test-user-id',
      course_instance_id: 'test-course-instance-id',
      created_at: new Date('2025-01-01T00:00:00Z'),
      status: 'joined',
      pending_uid: null,
      first_joined_at: null,
      lti_managed: false,
      pending_lti13_instance_id: null,
      pending_lti13_sub: null,
      pending_lti13_name: null,
      pending_lti13_email: null,
      ...overrides,
    };
  }

  function createMockPublishingExtension(
    overrides: Partial<CourseInstancePublishingExtension> = {},
  ): CourseInstancePublishingExtension {
    return {
      id: 'test-extension-id',
      course_instance_id: 'test-course-instance-id',
      name: 'Test Extension',
      end_date: new Date('2026-01-31T23:59:59Z'),
      ...overrides,
    };
  }

  describe('no publishing dates', () => {
    it('forbids access when publishing_start_date is null', async () => {
      const courseInstance = createMockCourseInstance({
        publishing_start_date: null,
        publishing_end_date: null,
      });
      const reqDate = new Date('2025-06-01T12:00:00Z');

      vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(null);

      const result = await calculateModernCourseInstanceStudentAccess(
        courseInstance,
        'test-user-id',
        reqDate,
      );

      assert.isFalse(result.has_student_access);
      assert.isFalse(result.has_student_access_with_enrollment);
    });
  });

  describe('before publishing start date', () => {
    it('forbids access when request date is before publishing_start_date', async () => {
      const courseInstance = createMockCourseInstance({
        publishing_start_date: new Date('2025-01-01T00:00:00Z'),
        publishing_end_date: new Date('2025-12-31T23:59:59Z'),
      });
      const reqDate = new Date('2024-12-31T23:59:59Z');

      vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(null);

      const result = await calculateModernCourseInstanceStudentAccess(
        courseInstance,
        'test-user-id',
        reqDate,
      );

      assert.isFalse(result.has_student_access);
      assert.isFalse(result.has_student_access_with_enrollment);
    });

    it('forbids access even with enrollment when before start date', async () => {
      const courseInstance = createMockCourseInstance({
        publishing_start_date: new Date('2025-01-01T00:00:00Z'),
        publishing_end_date: new Date('2025-12-31T23:59:59Z'),
      });
      const reqDate = new Date('2024-12-31T23:59:59Z');
      const enrollment = createMockEnrollment();

      vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(enrollment);

      const result = await calculateModernCourseInstanceStudentAccess(
        courseInstance,
        'test-user-id',
        reqDate,
      );

      assert.isFalse(result.has_student_access);
      assert.isFalse(result.has_student_access_with_enrollment);
    });
  });

  describe('between publishing dates', () => {
    it('allows access when request date is between start and end dates without enrollment', async () => {
      const courseInstance = createMockCourseInstance({
        publishing_start_date: new Date('2025-01-01T00:00:00Z'),
        publishing_end_date: new Date('2025-12-31T23:59:59Z'),
      });
      const reqDate = new Date('2025-06-01T12:00:00Z');

      vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(null);

      const result = await calculateModernCourseInstanceStudentAccess(
        courseInstance,
        'test-user-id',
        reqDate,
      );

      assert.isTrue(result.has_student_access);
      assert.isFalse(result.has_student_access_with_enrollment);
    });

    it('allows access with enrollment when request date is between start and end dates', async () => {
      const courseInstance = createMockCourseInstance({
        publishing_start_date: new Date('2025-01-01T00:00:00Z'),
        publishing_end_date: new Date('2025-12-31T23:59:59Z'),
      });
      const reqDate = new Date('2025-06-01T12:00:00Z');
      const enrollment = createMockEnrollment();

      vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(enrollment);

      const result = await calculateModernCourseInstanceStudentAccess(
        courseInstance,
        'test-user-id',
        reqDate,
      );

      assert.isTrue(result.has_student_access);
      assert.isTrue(result.has_student_access_with_enrollment);
    });
  });

  describe('after publishing end date', () => {
    it('forbids access when request date is after end date without enrollment', async () => {
      const courseInstance = createMockCourseInstance({
        publishing_start_date: new Date('2025-01-01T00:00:00Z'),
        publishing_end_date: new Date('2025-12-31T23:59:59Z'),
      });
      const reqDate = new Date('2026-01-01T00:00:00Z');

      vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(null);

      const result = await calculateModernCourseInstanceStudentAccess(
        courseInstance,
        'test-user-id',
        reqDate,
      );

      assert.isFalse(result.has_student_access);
      assert.isFalse(result.has_student_access_with_enrollment);
    });

    it('forbids access when request date is after end date with enrollment but no extensions', async () => {
      const courseInstance = createMockCourseInstance({
        publishing_start_date: new Date('2025-01-01T00:00:00Z'),
        publishing_end_date: new Date('2025-12-31T23:59:59Z'),
      });
      const reqDate = new Date('2026-01-01T00:00:00Z');
      const enrollment = createMockEnrollment();

      vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(enrollment);
      vi.spyOn(
        publishingExtensionsModel,
        'selectLatestPublishingExtensionByEnrollment',
      ).mockResolvedValue(null);

      const result = await calculateModernCourseInstanceStudentAccess(
        courseInstance,
        'test-user-id',
        reqDate,
      );

      assert.isFalse(result.has_student_access);
      assert.isFalse(result.has_student_access_with_enrollment);
    });
  });

  describe('with publishing extensions', () => {
    it('allows access when the request date is before the latest extension end date', async () => {
      const courseInstance = createMockCourseInstance({
        publishing_start_date: new Date('2025-01-01T00:00:00Z'),
        publishing_end_date: new Date('2025-12-31T23:59:59Z'),
      });
      const reqDate = new Date('2026-02-15T12:00:00Z');
      const enrollment = createMockEnrollment();
      const extension = createMockPublishingExtension({
        id: 'extension',
        end_date: new Date('2026-02-28T23:59:59Z'),
      });

      vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(enrollment);
      vi.spyOn(
        publishingExtensionsModel,
        'selectLatestPublishingExtensionByEnrollment',
      ).mockResolvedValue(extension);

      const result = await calculateModernCourseInstanceStudentAccess(
        courseInstance,
        'test-user-id',
        reqDate,
      );

      // Request date is 2026-02-15 12:00:00, latest extension is 2026-02-28 23:59:59
      assert.isTrue(result.has_student_access);
      assert.isTrue(result.has_student_access_with_enrollment);
    });

    it('forbids access when request date is after all extensions', async () => {
      const courseInstance = createMockCourseInstance({
        publishing_start_date: new Date('2025-01-01T00:00:00Z'),
        publishing_end_date: new Date('2025-12-31T23:59:59Z'),
      });
      const reqDate = new Date('2026-03-01T00:00:00Z');
      const enrollment = createMockEnrollment();
      const extension = createMockPublishingExtension({
        id: 'extension',
        end_date: new Date('2026-02-28T23:59:59Z'),
      });

      vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(enrollment);
      vi.spyOn(
        publishingExtensionsModel,
        'selectLatestPublishingExtensionByEnrollment',
      ).mockResolvedValue(extension);

      const result = await calculateModernCourseInstanceStudentAccess(
        courseInstance,
        'test-user-id',
        reqDate,
      );

      assert.isFalse(result.has_student_access);
      assert.isFalse(result.has_student_access_with_enrollment);
    });
  });
});

describe('checkCourseInstanceLegacyAccess', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  beforeAll(async () => {
    await execute(sql.setup_check_course_instance_legacy_access_tests);
  });

  it('passes if all parameters match', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['11'],
      userId: '1000',
      reqDate: new Date('2010-07-07T06:06:06Z'),
    });

    assert.deepEqual(result, ['11']);
  });

  it('fails if uid from school institution is not in the list', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['11'],
      userId: '1003',
      reqDate: new Date('2010-07-07T06:06:06Z'),
    });

    assert.deepEqual(result, []);
  });

  it('fails if uid from host institution is not in the list', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['11'],
      userId: '1004',
      reqDate: new Date('2010-07-07T06:06:06Z'),
    });

    assert.deepEqual(result, []);
  });

  it('fails if date is before start_date', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['11'],
      userId: '1000',
      reqDate: new Date('2007-07-07T06:06:06Z'),
    });

    assert.deepEqual(result, []);
  });

  it('fails if date is after end_date', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['11'],
      userId: '1000',
      reqDate: new Date('2017-07-07T06:06:06Z'),
    });

    assert.deepEqual(result, []);
  });

  it('passes if institution matches', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['12'],
      userId: '1002',
      reqDate: new Date('2011-07-07T06:06:06Z'),
    });

    assert.deepEqual(result, ['12']);
  });

  it('fails if institution specified and does not match', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['12'],
      userId: '1005',
      reqDate: new Date('2011-07-07T06:06:06Z'),
    });

    assert.deepEqual(result, []);
  });

  it('fails if institution specified in rule is not in the database', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['13'],
      userId: '1005',
      reqDate: new Date('2012-07-07T06:06:06Z'),
    });

    assert.deepEqual(result, []);
  });

  it('passes if user matches the default course institution for a null institution rule', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['14'],
      userId: '1006',
      reqDate: new Date('2013-07-07T06:06:06Z'),
    });

    assert.deepEqual(result, ['14']);
  });

  it('fails if user does not match the default course institution for a null institution rule', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['14'],
      userId: '1002',
      reqDate: new Date('2013-07-07T06:06:06Z'),
    });

    assert.deepEqual(result, []);
  });

  it('fails if institution is LTI and user was not created with a course instance', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['15'],
      userId: '1007',
      reqDate: new Date('2013-07-07T06:06:06Z'),
    });

    assert.deepEqual(result, []);
  });

  it('passes if institution is LTI and user was created with the correct course instance', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['15'],
      userId: '1008',
      reqDate: new Date('2013-07-07T06:06:06Z'),
    });

    assert.deepEqual(result, ['15']);
  });

  it('fails if institution is LTI and user was created with a different course instance', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['15'],
      userId: '1009',
      reqDate: new Date('2013-07-07T06:06:06Z'),
    });

    assert.deepEqual(result, []);
  });

  it('fails if date is after end_date and LTI matches', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['15'],
      userId: '1008',
      reqDate: new Date('2017-07-07T06:06:06Z'),
    });

    assert.deepEqual(result, []);
  });

  it('passes when rule has no uids list', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['12'],
      userId: '1002',
      reqDate: new Date('2011-07-07T06:06:06Z'),
    });

    assert.deepEqual(result, ['12']);
  });

  it('passes when rule has no start_date', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['16'],
      userId: '1004',
      reqDate: new Date('2014-01-07T06:06:06Z'),
    });

    assert.deepEqual(result, ['16']);
  });

  it('passes when rule has no end_date', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['17'],
      userId: '1002',
      reqDate: new Date('2016-07-07T06:06:06Z'),
    });

    assert.deepEqual(result, ['17']);
  });

  it('filters a list of course instances', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: ['11', '12', '13', '14', '15', '16', '17'],
      userId: '1002',
      reqDate: new Date('2011-07-07T06:06:06Z'),
    });

    assert.deepEqual(result.sort(), ['12', '16']);
  });

  it('return an empty list if no course instances provided', async () => {
    const result = await checkCourseInstanceLegacyAccess({
      courseInstanceIds: [],
      userId: '1002',
      reqDate: new Date('2011-07-07T06:06:06Z'),
    });

    assert.deepEqual(result, []);
  });
});
