import _ from 'lodash';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';

import { removeCookieClient, setCookieClient } from '../lib/client/cookie.js';
import type { PageContext } from '../lib/client/page-context.js';
import type { StaffUser } from '../lib/client/safe-db-types.js';

interface PermissionMeta {
  label: string;
  key: keyof PageContext['authz_data'];
  type: 'boolean' | 'string';
}

interface PermissionData extends PermissionMeta {
  value: boolean | string;
  authnValue: boolean | string;
}

const PermissionsTable = ({ permissions }: { permissions: PermissionData[] }) => {
  return (
    <table class="table table-sm border" style={{ tableLayout: 'fixed' }}>
      <thead>
        <tr>
          <th>Permission</th>
          <th>Effective User</th>
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
};

export function AuthzAccessMismatch({
  errorMessage,
  oneOfPermissionKeys,
  authzData,
  authnUser,
  authzUser,
}: {
  errorMessage: string;
  oneOfPermissionKeys: (keyof PageContext['authz_data'])[];
  authzData: PageContext['authz_data'];
  authnUser: StaffUser;
  authzUser: StaffUser | null;
}) {
  const clearEffectiveUserCookies = () => {
    removeCookieClient(['pl_requested_uid', 'pl2_requested_uid']);
    removeCookieClient(['pl_requested_course_role', 'pl2_requested_course_role']);
    removeCookieClient(['pl_requested_course_instance_role', 'pl2_requested_course_instance_role']);
    removeCookieClient(['pl_requested_date', 'pl2_requested_date']);
    setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    window.location.reload();
  };

  const permissionsMeta = [
    {
      label: 'Administrator',
      key: 'is_administrator',
      type: 'boolean',
    },
    {
      label: 'Course preview',
      key: 'has_course_permission_preview',
      type: 'boolean',
    },
    {
      label: 'Course view',
      key: 'has_course_permission_view',
      type: 'boolean',
    },
    {
      label: 'Course edit',
      key: 'has_course_permission_edit',
      type: 'boolean',
    },
    {
      label: 'Course own',
      key: 'has_course_permission_own',
      type: 'boolean',
    },
    {
      label: 'Student access',
      key: 'has_student_access',
      type: 'boolean',
    },
    {
      label: 'Enrollment student access',
      key: 'has_student_access_with_enrollment',
      type: 'boolean',
    },
    {
      label: 'Course instance view',
      key: 'has_course_instance_permission_view',
      type: 'boolean',
    },
    {
      label: 'Course instance edit',
      key: 'has_course_instance_permission_edit',
      type: 'boolean',
    },
    {
      label: 'Course role',
      key: 'course_role',
      type: 'string',
    },
    {
      label: 'Course instance role',
      key: 'course_instance_role',
      type: 'string',
    },
  ] satisfies PermissionMeta[];

  const permissions: PermissionData[] = permissionsMeta.map((permission) => {
    return {
      authnValue:
        (authzData as any)['authn_' + permission.key] ??
        (permission.type === 'string' ? '' : false),
      value: (authzData as any)[permission.key] ?? (permission.type === 'string' ? '' : false),
      ...permission,
    };
  });

  const [oneOfPermissions, allOtherPermissions] = _.partition(permissions, (permission) =>
    oneOfPermissionKeys.includes(permission.key),
  );

  // Only show the permissions that are different between authn and authz
  const otherPermissons = allOtherPermissions.filter(
    (permission) => permission.authnValue !== permission.value,
  );

  return (
    <main id="content" class="container">
      <div class="card mb-4">
        <div class="card-header bg-danger text-white">Insufficient access</div>
        <div class="card-body">
          <h2 class="mb-3 h4">Effective user has insufficient access</h2>
          <p>
            The
            {authzUser ? (
              <OverlayTrigger
                overlay={
                  <Tooltip>
                    {authzUser.name} ({authzUser.uid})
                  </Tooltip>
                }
              >
                <button type="button" class="btn btn-link link-secondary p-0 mx-1 align-baseline">
                  current effective user
                </button>
              </OverlayTrigger>
            ) : (
              ' current user '
            )}
            does
            <OverlayTrigger overlay={<Tooltip>{errorMessage}</Tooltip>}>
              <button type="button" class="btn btn-link link-secondary p-0 mx-1 align-baseline">
                not have access
              </button>
            </OverlayTrigger>
            to this page, but
            <OverlayTrigger
              overlay={
                <Tooltip>
                  {authnUser.name} ({authnUser.uid})
                </Tooltip>
              }
            >
              <button type="button" class="btn btn-link link-secondary p-0 mx-1 align-baseline">
                your account
              </button>
            </OverlayTrigger>
            does.
          </p>

          <details class="mb-3">
            <summary>View permission differences</summary>
            <div class="mt-3">
              <h6>One of these permissions is required</h6>
              <PermissionsTable permissions={oneOfPermissions} />
              {otherPermissons.length > 0 && (
                <>
                  <h6>Other permission differences</h6>
                  <PermissionsTable permissions={otherPermissons} />
                </>
              )}
            </div>
          </details>

          <button type="button" class="btn btn-primary" onClick={clearEffectiveUserCookies}>
            Clear effective user
          </button>
        </div>
      </div>
    </main>
  );
}

AuthzAccessMismatch.displayName = 'AuthzAccessMismatch';
