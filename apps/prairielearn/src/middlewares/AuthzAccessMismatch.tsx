import _ from 'lodash';

import { removeCookieClient, setCookieClient } from '../lib/client/cookie.js';
import type { PageContext } from '../lib/client/page-context.js';
import type { StaffUser } from '../lib/client/safe-db-types.js';

// These keys can be used as part of permission checks.
export type CheckablePermissionKeys = Extract<
  | 'is_administrator'
  | 'has_course_permission_preview'
  | 'has_course_permission_view'
  | 'has_course_permission_edit'
  | 'has_course_permission_own'
  | 'has_course_instance_permission_view'
  | 'has_course_instance_permission_edit'
  | 'has_student_access'
  | 'has_student_access_with_enrollment',
  keyof PageContext['authz_data']
>;

// These keys are used to show users diagnostic information about their permissions.
type DiagnosticPermissionKeys = Extract<
  CheckablePermissionKeys | 'course_role' | 'course_instance_role',
  keyof PageContext['authz_data']
>;

interface PermissionMeta {
  label: string;
  key: DiagnosticPermissionKeys;
  type: 'boolean' | 'string';
}

interface PermissionData extends PermissionMeta {
  value: boolean | string;
  authnValue: boolean | string;
}

export const PERMISSIONS_META = [
  {
    label: 'Administrator',
    key: 'is_administrator',
    type: 'boolean',
  },
  {
    label: 'Course role',
    key: 'course_role',
    type: 'string',
  },
  {
    label: 'Course previewer',
    key: 'has_course_permission_preview',
    type: 'boolean',
  },
  {
    label: 'Course viewer',
    key: 'has_course_permission_view',
    type: 'boolean',
  },
  {
    label: 'Course editor',
    key: 'has_course_permission_edit',
    type: 'boolean',
  },
  {
    label: 'Course owner',
    key: 'has_course_permission_own',
    type: 'boolean',
  },
  {
    label: 'Course instance role',
    key: 'course_instance_role',
    type: 'string',
  },
  {
    label: 'Student data viewer',
    key: 'has_course_instance_permission_view',
    type: 'boolean',
  },
  {
    label: 'Student data editor',
    key: 'has_course_instance_permission_edit',
    type: 'boolean',
  },
  {
    label: 'Student access',
    key: 'has_student_access',
    type: 'boolean',
  },
  {
    label: 'Enrolled student access',
    key: 'has_student_access_with_enrollment',
    type: 'boolean',
  },
] satisfies PermissionMeta[];

function PermissionsTable({ permissions }: { permissions: PermissionData[] }) {
  return (
    <table class="table table-sm border" style={{ tableLayout: 'fixed' }}>
      <thead>
        <tr>
          <th>Permission</th>
          <th>Effective User/Role</th>
          <th>Your Account</th>
        </tr>
      </thead>
      <tbody>
        {permissions.map((permission) => (
          <tr key={permission.key}>
            <td>{permission.label}</td>
            <td>
              {permission.type === 'boolean' ? (
                <span class={`badge ${permission.value ? 'bg-success' : 'bg-danger'}`}>
                  {permission.value ? 'Yes' : 'No'}
                </span>
              ) : (
                permission.value
              )}
            </td>
            <td>
              {permission.type === 'boolean' ? (
                <span class={`badge ${permission.authnValue ? 'bg-success' : 'bg-danger'}`}>
                  {permission.authnValue ? 'Yes' : 'No'}
                </span>
              ) : (
                permission.authnValue
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function clearEffectiveUserCookies() {
  removeCookieClient(['pl_requested_uid', 'pl2_requested_uid']);
  removeCookieClient(['pl_requested_course_role', 'pl2_requested_course_role']);
  removeCookieClient(['pl_requested_course_instance_role', 'pl2_requested_course_instance_role']);
  removeCookieClient(['pl_requested_date', 'pl2_requested_date']);
  setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
  window.location.reload();
}

function formatUser(user: StaffUser) {
  if (!user.name) return user.uid;
  return `${user.name} (${user.uid})`;
}

export function AuthzAccessMismatch({
  errorExplanation,
  oneOfPermissionKeys,
  authzData,
  authnUser,
  authzUser,
}: {
  /**
   * A sentence-like description of why the user can't access the page. If not provided,
   * one will be generated from `oneOfPermissionKeys`.
   */
  errorExplanation?: string;
  oneOfPermissionKeys: CheckablePermissionKeys[];
  authzData: PageContext['authz_data'];
  authnUser: StaffUser;
  authzUser: StaffUser | null;
}) {
  const permissions: PermissionData[] = PERMISSIONS_META.map((permission) => {
    return {
      authnValue:
        authzData[`authn_${permission.key}`] ?? (permission.type === 'string' ? '' : false),
      value: authzData[permission.key] ?? (permission.type === 'string' ? '' : false),
      ...permission,
    };
  });

  const [oneOfPermissions, allOtherPermissions] = _.partition(permissions, (permission) =>
    (oneOfPermissionKeys as string[]).includes(permission.key),
  );

  // Only show the permissions that are different between authn and authz
  const otherPermissions = allOtherPermissions.filter(
    (permission) => permission.authnValue !== permission.value,
  );

  // Use special messaging if there is an effective role but the effective user remains the same
  const hasEffectiveUser = authzUser?.user_id !== authnUser.user_id;
  const isStudentViewActive =
    !authzData.has_course_permission_preview && !authzData.has_course_instance_permission_view;

  return (
    <main id="content" class="container">
      <div class="card mb-4">
        <div class="card-header bg-danger text-white">
          <h1>Effective user has insufficient access</h1>
        </div>
        <div class="card-body">
          <p>{errorExplanation}</p>
          {hasEffectiveUser ? (
            <p>
              The current effective user {authzUser && <strong>{formatUser(authzUser)}</strong>}{' '}
              does not have access to this page, but your account{' '}
              <strong>{formatUser(authnUser)}</strong> does.
            </p>
          ) : isStudentViewActive ? (
            <p>
              You are currently in <strong>Student view</strong>, which does not give you permission
              to this page, but your account permissions do.
            </p>
          ) : (
            <p>
              The current effective role does not have access to this page, but your account
              permissions do.
            </p>
          )}

          <details class="mb-3">
            <summary class="mb-1">View missing permissions</summary>
            <PermissionsTable permissions={oneOfPermissions} />
            {otherPermissions.length > 0 && (
              <details>
                <summary class="mb-1">Other permission differences</summary>
                <PermissionsTable permissions={otherPermissions} />
              </details>
            )}
          </details>

          <button type="button" class="btn btn-primary" onClick={clearEffectiveUserCookies}>
            Clear effective {hasEffectiveUser ? 'user' : 'role'}
          </button>
        </div>
      </div>
    </main>
  );
}

AuthzAccessMismatch.displayName = 'AuthzAccessMismatch';
