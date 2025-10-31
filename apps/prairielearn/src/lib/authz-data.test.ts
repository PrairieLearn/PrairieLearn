import { assert, beforeEach, describe, it, vi } from 'vitest';

import * as publishingExtensionsModel from '../models/course-instance-publishing-extensions.js';
import * as enrollmentModel from '../models/enrollment.js';

import type { RawPageAuthzData } from './authz-data-lib.js';
import { calculateModernCourseInstanceStudentAccess } from './authz-data.js';
import type { CourseInstance, CourseInstancePublishingExtension, Enrollment } from './db-types.js';

describe('calculateModernCourseInstanceStudentAccess', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function createMockCourseInstance(overrides: Partial<CourseInstance> = {}): CourseInstance {
    return {
      id: 'test-course-instance-id',
      course_id: 'test-course-id',
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
      hide_in_enroll_page: null,
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

  function createMockAuthzData(overrides: Partial<RawPageAuthzData> = {}): RawPageAuthzData {
    return {
      authn_user: {
        email: 'test@example.com',
        institution_id: '1',
        name: 'Test User',
        uid: 'test@example.com',
        uin: '123456789',
        user_id: 'test-user-id',
      },
      user: {
        email: 'test@example.com',
        institution_id: '1',
        name: 'Test User',
        uid: 'test@example.com',
        uin: '123456789',
        user_id: 'test-user-id',
      },
      authn_is_administrator: false,
      authn_has_course_permission_preview: false,
      authn_has_course_permission_view: false,
      authn_has_course_permission_edit: false,
      authn_has_course_permission_own: false,
      authn_course_role: undefined,
      authn_course_instance_role: 'None',
      authn_mode: undefined,
      authn_has_student_access: false,
      authn_has_student_access_with_enrollment: false,
      authn_has_course_instance_permission_view: false,
      authn_has_course_instance_permission_edit: false,
      is_administrator: false,
      has_course_permission_preview: false,
      has_course_permission_view: false,
      has_course_permission_edit: false,
      has_course_permission_own: false,
      course_role: undefined,
      course_instance_role: 'None',
      mode: undefined,
      has_student_access: false,
      has_student_access_with_enrollment: false,
      has_course_instance_permission_view: false,
      has_course_instance_permission_edit: false,
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
      const authzData = createMockAuthzData();
      const reqDate = new Date('2025-06-01T12:00:00Z');

      vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(null);

      const result = await calculateModernCourseInstanceStudentAccess(
        courseInstance,
        authzData,
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
      const authzData = createMockAuthzData();
      const reqDate = new Date('2024-12-31T23:59:59Z');

      vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(null);

      const result = await calculateModernCourseInstanceStudentAccess(
        courseInstance,
        authzData,
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
      const authzData = createMockAuthzData();
      const reqDate = new Date('2024-12-31T23:59:59Z');
      const enrollment = createMockEnrollment();

      vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(enrollment);

      const result = await calculateModernCourseInstanceStudentAccess(
        courseInstance,
        authzData,
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
      const authzData = createMockAuthzData();
      const reqDate = new Date('2025-06-01T12:00:00Z');

      vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(null);

      const result = await calculateModernCourseInstanceStudentAccess(
        courseInstance,
        authzData,
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
      const authzData = createMockAuthzData();
      const reqDate = new Date('2025-06-01T12:00:00Z');
      const enrollment = createMockEnrollment();

      vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(enrollment);

      const result = await calculateModernCourseInstanceStudentAccess(
        courseInstance,
        authzData,
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
      const authzData = createMockAuthzData();
      const reqDate = new Date('2026-01-01T00:00:00Z');

      vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(null);

      const result = await calculateModernCourseInstanceStudentAccess(
        courseInstance,
        authzData,
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
      const authzData = createMockAuthzData();
      const reqDate = new Date('2026-01-01T00:00:00Z');
      const enrollment = createMockEnrollment();

      vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(enrollment);
      vi.spyOn(
        publishingExtensionsModel,
        'selectLatestPublishingExtensionByEnrollment',
      ).mockResolvedValue(null);

      const result = await calculateModernCourseInstanceStudentAccess(
        courseInstance,
        authzData,
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
      const authzData = createMockAuthzData();
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
        authzData,
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
      const authzData = createMockAuthzData();
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
        authzData,
        reqDate,
      );

      assert.isFalse(result.has_student_access);
      assert.isFalse(result.has_student_access_with_enrollment);
    });
  });
});
