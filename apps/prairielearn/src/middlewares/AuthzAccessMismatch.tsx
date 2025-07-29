import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';

import { removeCookieClient, setCookieClient } from '../lib/client/cookie.js';
import type { PageContext } from '../lib/client/page-context.js';
import type { StaffUser } from '../lib/client/safe-db-types.js';

export function AuthzAccessMismatch({
  errorMessage,
  authzData,
  authnUser,
}: {
  errorMessage: string;
  authzData: PageContext['authz_data'];
  authnUser: StaffUser;
}) {
  const clearEffectiveUserCookies = () => {
    removeCookieClient(['pl_requested_uid', 'pl2_requested_uid']);
    removeCookieClient(['pl_requested_course_role', 'pl2_requested_course_role']);
    removeCookieClient(['pl_requested_course_instance_role', 'pl2_requested_course_instance_role']);
    removeCookieClient(['pl_requested_date', 'pl2_requested_date']);
    setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    window.location.reload();
  };
  const authzUser = authzData.user;

  const listedPermissions = [
    {
      label: 'Administrator',
      key: 'is_administrator',
    },
    {
      label: 'Course preview',
      key: 'has_course_permission_preview',
    },
    {
      label: 'Course view',
      key: 'has_course_permission_view',
    },
    {
      label: 'Course edit',
      key: 'has_course_permission_edit',
    },
    {
      label: 'Course own',
      key: 'has_course_permission_own',
    },
    {
      label: 'Student access',
      key: 'has_student_access',
    },
    {
      label: 'Enrollment student access',
      key: 'has_student_access_with_enrollment',
    },
    {
      label: 'Course instance view',
      key: 'has_course_instance_permission_view',
    },
    {
      label: 'Course instance edit',
      key: 'has_course_instance_permission_edit',
    },
  ] satisfies { label: string; key: keyof PageContext['authz_data'] }[];

  // Only show the permissions that are different between authn and authz
  const authzPermissions = listedPermissions.filter(
    (permission) => (authzData as any)['authn_' + permission.key] !== authzData[permission.key],
  );

  return (
    <main id="content" class="container">
      <div class="card mb-4">
        <div class="card-header bg-danger text-white">Insufficient access</div>
        <div class="card-body">
          <h2 class="mb-3 h4">Effective user has insufficient access</h2>
          <p>
            The
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
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Permission</th>
                    <th>Effective User</th>
                    <th>Your Account</th>
                  </tr>
                </thead>
                <tbody>
                  {authzPermissions.map((permission) => (
                    <tr key={permission.key}>
                      <td>{permission.label}</td>
                      <td>
                        <span
                          class={`badge ${authzData[permission.key] ? 'bg-success' : 'bg-danger'}`}
                        >
                          {authzData[permission.key] ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td>
                        <span
                          class={`badge ${(authzData as any)['authn_' + permission.key] ? 'bg-success' : 'bg-danger'}`}
                        >
                          {(authzData as any)['authn_' + permission.key] ? 'Yes' : 'No'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>Course role</td>
                    <td>{authzData.course_role}</td>
                    <td>{authzData.authn_course_role}</td>
                  </tr>
                  <tr>
                    <td>Course instance role</td>
                    <td>{authzData.course_instance_role}</td>
                    <td>{authzData.authn_course_instance_role}</td>
                  </tr>
                </tbody>
              </table>
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
