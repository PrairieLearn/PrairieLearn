import { assert, beforeEach, describe, it, vi } from 'vitest';

import * as publishingExtensionsModel from '../models/course-instance-publishing-extensions.js';
import * as enrollmentModel from '../models/enrollment.js';

import {
  calculateModernCourseInstanceStudentAccess,
  dangerousFullSystemAuthz,
  hasRole,
} from './authzData.js';
import type { AuthzData, CourseInstanceRole, RawPageAuthzData } from './authzData.types.js';
import type { CourseInstance, CourseInstancePublishingExtension, Enrollment } from './db-types.js';

describe('authzData', () => {
  describe('hasRole', () => {
    function createMockAuthzData(overrides: Partial<AuthzData> = {}): AuthzData {
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
      } as AuthzData;
    }

    describe('dangerous full authz for testing', () => {
      it('returns true for any role when using dangerous full authz', () => {
        const dangerousAuthz = dangerousFullSystemAuthz();
        const roles: CourseInstanceRole[] = [
          'System',
          'None',
          'Student',
          'Student Data Viewer',
          'Student Data Editor',
          'Any',
        ];

        for (const role of roles) {
          assert.isTrue(hasRole(dangerousAuthz, role), `Should return true for role: ${role}`);
        }
      });
    });

    describe('None role', () => {
      it('returns true for None role regardless of permissions', () => {
        const authzData = createMockAuthzData({
          has_student_access: false,
          has_course_instance_permission_view: false,
          has_course_instance_permission_edit: false,
        });

        assert.isTrue(hasRole(authzData, 'None'));
      });

      it('returns true for None role even with all permissions', () => {
        const authzData = createMockAuthzData({
          has_student_access: true,
          has_course_instance_permission_view: true,
          has_course_instance_permission_edit: true,
        });

        assert.isTrue(hasRole(authzData, 'None'));
      });
    });

    describe('Student role', () => {
      it('returns true when user has student access and course_instance_role is None', () => {
        const authzData = createMockAuthzData({
          has_student_access: true,
          course_instance_role: 'None',
        });

        assert.isTrue(hasRole(authzData, 'Student'));
      });

      it('returns false when user has student access but course_instance_role is not None', () => {
        const authzData = createMockAuthzData({
          has_student_access: true,
          course_instance_role: 'Student Data Viewer',
        });

        assert.isFalse(hasRole(authzData, 'Student'));
      });

      it('returns false when user does not have student access', () => {
        const authzData = createMockAuthzData({
          has_student_access: false,
          course_instance_role: 'None',
        });

        assert.isFalse(hasRole(authzData, 'Student'));
      });
    });

    describe('Student Data Viewer role', () => {
      it('returns true when user has course instance permission view', () => {
        const authzData = createMockAuthzData({
          has_course_instance_permission_view: true,
        });

        assert.isTrue(hasRole(authzData, 'Student Data Viewer'));
      });

      it('returns false when user does not have course instance permission view', () => {
        const authzData = createMockAuthzData({
          has_course_instance_permission_view: false,
        });

        assert.isFalse(hasRole(authzData, 'Student Data Viewer'));
      });
    });

    describe('Student Data Editor role', () => {
      it('returns true when user has course instance permission edit', () => {
        const authzData = createMockAuthzData({
          has_course_instance_permission_edit: true,
        });

        assert.isTrue(hasRole(authzData, 'Student Data Editor'));
      });

      it('returns false when user does not have course instance permission edit', () => {
        const authzData = createMockAuthzData({
          has_course_instance_permission_edit: false,
        });

        assert.isFalse(hasRole(authzData, 'Student Data Editor'));
      });
    });

    describe('Any role', () => {
      it('returns true when user has student access and course_instance_role is None', () => {
        const authzData = createMockAuthzData({
          has_student_access: true,
          course_instance_role: 'None',
        });

        assert.isTrue(hasRole(authzData, 'Any'));
      });

      it('returns true when user has course instance permission view', () => {
        const authzData = createMockAuthzData({
          has_course_instance_permission_view: true,
        });

        assert.isTrue(hasRole(authzData, 'Any'));
      });

      it('returns true when user has course instance permission edit', () => {
        const authzData = createMockAuthzData({
          has_course_instance_permission_edit: true,
        });

        assert.isTrue(hasRole(authzData, 'Any'));
      });

      it('returns false when user has no permissions', () => {
        const authzData = createMockAuthzData({
          has_student_access: false,
          has_course_instance_permission_view: false,
          has_course_instance_permission_edit: false,
        });

        assert.isFalse(hasRole(authzData, 'Any'));
      });

      it('returns false when user has student access but course_instance_role is not None', () => {
        const authzData = createMockAuthzData({
          has_student_access: true,
          course_instance_role: 'Student Data Viewer',
          has_course_instance_permission_view: false,
          has_course_instance_permission_edit: false,
        });

        assert.isFalse(hasRole(authzData, 'Any'));
      });
    });

    describe('edge cases', () => {
      it('handles undefined course_instance_role', () => {
        const authzData = createMockAuthzData({
          has_student_access: true,
          course_instance_role: undefined,
        });

        // When course_instance_role is undefined, it's not equal to 'None', so Student role should fail
        assert.isFalse(hasRole(authzData, 'Student'));
      });

      it('handles undefined permissions', () => {
        const authzData = createMockAuthzData({
          has_student_access: undefined,
          has_course_instance_permission_view: undefined,
          has_course_instance_permission_edit: undefined,
        });

        assert.isTrue(hasRole(authzData, 'None'));
        assert.isFalse(hasRole(authzData, 'Student'));
        assert.isFalse(hasRole(authzData, 'Student Data Viewer'));
        assert.isFalse(hasRole(authzData, 'Student Data Editor'));
        assert.isFalse(hasRole(authzData, 'Any'));
      });
    });

    describe('role hierarchy', () => {
      it('Student Data Viewer does not have Student Data Editor permissions', () => {
        const authzData = createMockAuthzData({
          has_course_instance_permission_view: true,
          has_course_instance_permission_edit: false,
        });

        assert.isTrue(hasRole(authzData, 'Student Data Viewer'));
        assert.isFalse(hasRole(authzData, 'Student Data Editor'));
      });
    });
  });

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
      } as CourseInstance;
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
      } as RawPageAuthzData;
    }

    function createMockEnrollment(overrides: Partial<Enrollment> = {}): Enrollment {
      return {
        id: 'test-enrollment-id',
        user_id: 'test-user-id',
        course_instance_id: 'test-course-instance-id',
        role: 'Student',
        created_at: new Date('2025-01-01T00:00:00Z'),
        ...overrides,
      } as Enrollment;
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
      } as CourseInstancePublishingExtension;
    }

    describe('no publishing dates', () => {
      it('returns no access when publishing_start_date is null', async () => {
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
      it('returns no access when request date is before publishing_start_date', async () => {
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

      it('returns no access even with enrollment when before start date', async () => {
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
      it('returns access when request date is between start and end dates without enrollment', async () => {
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

      it('returns access with enrollment when request date is between start and end dates', async () => {
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
      it('returns no access when request date is after end date without enrollment', async () => {
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

      it('returns no access when request date is after end date with enrollment but no extensions', async () => {
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
          'selectPublishingExtensionsByEnrollmentId',
        ).mockResolvedValue([]);

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
      it('returns access when the request date is before the latest extension end date', async () => {
        const courseInstance = createMockCourseInstance({
          publishing_start_date: new Date('2025-01-01T00:00:00Z'),
          publishing_end_date: new Date('2025-12-31T23:59:59Z'),
        });
        const authzData = createMockAuthzData();
        const reqDate = new Date('2026-02-15T12:00:00Z');
        const enrollment = createMockEnrollment();
        const extension1 = createMockPublishingExtension({
          id: 'extension-1',
          end_date: new Date('2026-01-31T23:59:59Z'),
        });
        const extension2 = createMockPublishingExtension({
          id: 'extension-2',
          end_date: new Date('2026-02-28T23:59:59Z'),
        });
        const extension3 = createMockPublishingExtension({
          id: 'extension-3',
          end_date: new Date('2026-02-15T00:00:00Z'),
        });

        vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(enrollment);
        vi.spyOn(
          publishingExtensionsModel,
          'selectPublishingExtensionsByEnrollmentId',
        ).mockResolvedValue([extension1, extension2, extension3]);

        const result = await calculateModernCourseInstanceStudentAccess(
          courseInstance,
          authzData,
          reqDate,
        );

        // Request date is 2026-02-15 12:00:00, latest extension is 2026-02-28 23:59:59
        assert.isTrue(result.has_student_access);
        assert.isTrue(result.has_student_access_with_enrollment);
      });

      it('returns no access when request date is after all extensions', async () => {
        const courseInstance = createMockCourseInstance({
          publishing_start_date: new Date('2025-01-01T00:00:00Z'),
          publishing_end_date: new Date('2025-12-31T23:59:59Z'),
        });
        const authzData = createMockAuthzData();
        const reqDate = new Date('2026-03-01T00:00:00Z');
        const enrollment = createMockEnrollment();
        const extension1 = createMockPublishingExtension({
          id: 'extension-1',
          end_date: new Date('2026-01-31T23:59:59Z'),
        });
        const extension2 = createMockPublishingExtension({
          id: 'extension-2',
          end_date: new Date('2026-02-28T23:59:59Z'),
        });

        vi.spyOn(enrollmentModel, 'selectOptionalEnrollmentByUserId').mockResolvedValue(enrollment);
        vi.spyOn(
          publishingExtensionsModel,
          'selectPublishingExtensionsByEnrollmentId',
        ).mockResolvedValue([extension1, extension2]);

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
});
