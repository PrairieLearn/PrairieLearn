import { assert, describe, it } from 'vitest';

import { type AuthzData, type Role, dangerousFullSystemAuthz, hasRole } from './authz-data-lib.js';

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

    describe('dangerous full system authz', () => {
      it('returns true for system/any role when using dangerous full authz', () => {
        const dangerousAuthz = dangerousFullSystemAuthz();
        const goodRoles: Role[] = ['System'];
        const badRoles: Role[] = [
          'Student',
          'Student Data Viewer',
          'Student Data Editor',
          'Previewer',
          'Viewer',
          'Editor',
          'Owner',
        ];

        for (const role of goodRoles) {
          assert.isTrue(hasRole(dangerousAuthz, [role]), `Should return true for role: ${role}`);
        }
        for (const role of badRoles) {
          assert.isFalse(hasRole(dangerousAuthz, [role]), `Should return false for role: ${role}`);
        }
      });
    });

    describe('Student role', () => {
      it('returns true when user has student access and course_instance_role is None', () => {
        const authzData = createMockAuthzData({
          has_student_access: true,
          course_instance_role: 'None',
        });

        assert.isTrue(hasRole(authzData, ['Student']));
      });

      it('returns false when user has student access but course_instance_role is not None', () => {
        const authzData = createMockAuthzData({
          has_student_access: true,
          course_instance_role: 'Student Data Viewer',
        });

        assert.isFalse(hasRole(authzData, ['Student']));
      });

      it('returns false when user does not have student access', () => {
        const authzData = createMockAuthzData({
          has_student_access: false,
          course_instance_role: 'None',
        });

        assert.isFalse(hasRole(authzData, ['Student']));
      });
    });

    describe('Student Data Viewer role', () => {
      it('returns true when user has course instance permission view', () => {
        const authzData = createMockAuthzData({
          has_course_instance_permission_view: true,
        });

        assert.isTrue(hasRole(authzData, ['Student Data Viewer']));
      });

      it('returns false when user does not have course instance permission view', () => {
        const authzData = createMockAuthzData({
          has_course_instance_permission_view: false,
        });

        assert.isFalse(hasRole(authzData, ['Student Data Viewer']));
      });
    });

    describe('Student Data Editor role', () => {
      it('returns true when user has course instance permission edit', () => {
        const authzData = createMockAuthzData({
          has_course_instance_permission_edit: true,
        });

        assert.isTrue(hasRole(authzData, ['Student Data Editor']));
      });

      it('returns false when user does not have course instance permission edit', () => {
        const authzData = createMockAuthzData({
          has_course_instance_permission_edit: false,
        });

        assert.isFalse(hasRole(authzData, ['Student Data Editor']));
      });
    });

    describe('Previewer role', () => {
      it('returns true when user has course permission preview', () => {
        const authzData = createMockAuthzData({
          has_course_permission_preview: true,
        });

        assert.isTrue(hasRole(authzData, ['Previewer']));
      });

      it('returns false when user does not have course permission preview', () => {
        const authzData = createMockAuthzData({
          has_course_permission_preview: false,
        });

        assert.isFalse(hasRole(authzData, ['Previewer']));
      });
    });

    describe('Viewer role', () => {
      it('returns true when user has course permission view', () => {
        const authzData = createMockAuthzData({
          has_course_permission_view: true,
        });

        assert.isTrue(hasRole(authzData, ['Viewer']));
      });

      it('returns false when user does not have course permission view', () => {
        const authzData = createMockAuthzData({
          has_course_permission_view: false,
        });

        assert.isFalse(hasRole(authzData, ['Viewer']));
      });
    });

    describe('Editor role', () => {
      it('returns true when user has course permission edit', () => {
        const authzData = createMockAuthzData({
          has_course_permission_edit: true,
        });

        assert.isTrue(hasRole(authzData, ['Editor']));
      });

      it('returns false when user does not have course permission edit', () => {
        const authzData = createMockAuthzData({
          has_course_permission_edit: false,
        });

        assert.isFalse(hasRole(authzData, ['Editor']));
      });
    });

    describe('Owner role', () => {
      it('returns true when user has course permission own', () => {
        const authzData = createMockAuthzData({
          has_course_permission_own: true,
        });

        assert.isTrue(hasRole(authzData, ['Owner']));
      });

      it('returns false when user does not have course permission own', () => {
        const authzData = createMockAuthzData({
          has_course_permission_own: false,
        });

        assert.isFalse(hasRole(authzData, ['Owner']));
      });
    });

    describe('edge cases', () => {
      it('handles undefined course_instance_role', () => {
        const authzData = createMockAuthzData({
          has_student_access: true,
          course_instance_role: undefined,
        });

        // When course_instance_role is undefined, it's not equal to 'None', so Student role should fail
        assert.isFalse(hasRole(authzData, ['Student']));
      });

      it('handles undefined permissions', () => {
        const authzData = createMockAuthzData({
          has_student_access: undefined,
          has_course_instance_permission_view: undefined,
          has_course_instance_permission_edit: undefined,
        });

        assert.isFalse(hasRole(authzData, ['Student']));
        assert.isFalse(hasRole(authzData, ['Student Data Viewer']));
        assert.isFalse(hasRole(authzData, ['Student Data Editor']));
      });
    });

    describe('role hierarchy', () => {
      it('Student Data Viewer does not have Student Data Editor permissions', () => {
        const authzData = createMockAuthzData({
          has_course_instance_permission_view: true,
          has_course_instance_permission_edit: false,
        });

        assert.isTrue(hasRole(authzData, ['Student Data Viewer']));
        assert.isFalse(hasRole(authzData, ['Student Data Editor']));
      });

      it('Previewer does not have Viewer, Editor, or Owner permissions', () => {
        const authzData = createMockAuthzData({
          has_course_permission_preview: true,
          has_course_permission_view: false,
          has_course_permission_edit: false,
          has_course_permission_own: false,
        });

        assert.isTrue(hasRole(authzData, ['Previewer']));
        assert.isFalse(hasRole(authzData, ['Viewer']));
        assert.isFalse(hasRole(authzData, ['Editor']));
        assert.isFalse(hasRole(authzData, ['Owner']));
      });

      it('Viewer has Previewer permissions but not Editor or Owner', () => {
        const authzData = createMockAuthzData({
          has_course_permission_preview: true,
          has_course_permission_view: true,
          has_course_permission_edit: false,
          has_course_permission_own: false,
        });

        assert.isTrue(hasRole(authzData, ['Previewer']));
        assert.isTrue(hasRole(authzData, ['Viewer']));
        assert.isFalse(hasRole(authzData, ['Editor']));
        assert.isFalse(hasRole(authzData, ['Owner']));
      });

      it('Editor has Previewer and Viewer permissions but not Owner', () => {
        const authzData = createMockAuthzData({
          has_course_permission_preview: true,
          has_course_permission_view: true,
          has_course_permission_edit: true,
          has_course_permission_own: false,
        });

        assert.isTrue(hasRole(authzData, ['Previewer']));
        assert.isTrue(hasRole(authzData, ['Viewer']));
        assert.isTrue(hasRole(authzData, ['Editor']));
        assert.isFalse(hasRole(authzData, ['Owner']));
      });

      it('Owner has all course permissions', () => {
        const authzData = createMockAuthzData({
          has_course_permission_preview: true,
          has_course_permission_view: true,
          has_course_permission_edit: true,
          has_course_permission_own: true,
        });

        assert.isTrue(hasRole(authzData, ['Previewer']));
        assert.isTrue(hasRole(authzData, ['Viewer']));
        assert.isTrue(hasRole(authzData, ['Editor']));
        assert.isTrue(hasRole(authzData, ['Owner']));
      });
    });

    describe('multiple roles', () => {
      it('returns true if user has any of the required course roles', () => {
        const authzData = createMockAuthzData({
          has_course_permission_preview: false,
          has_course_permission_view: true,
          has_course_permission_edit: false,
          has_course_permission_own: false,
        });

        assert.isTrue(hasRole(authzData, ['Previewer', 'Viewer']));
        assert.isTrue(hasRole(authzData, ['Viewer', 'Editor']));
        assert.isFalse(hasRole(authzData, ['Editor', 'Owner']));
      });

      it('returns true if user has any combination of course and course instance roles', () => {
        const authzData = createMockAuthzData({
          has_course_permission_preview: true,
          has_course_permission_view: false,
          has_course_instance_permission_view: true,
          has_course_instance_permission_edit: false,
        });

        assert.isTrue(hasRole(authzData, ['Previewer', 'Student Data Viewer']));
        assert.isTrue(hasRole(authzData, ['Viewer', 'Student Data Viewer']));
        assert.isFalse(hasRole(authzData, ['Viewer', 'Student Data Editor']));
      });
    });
  });
});
