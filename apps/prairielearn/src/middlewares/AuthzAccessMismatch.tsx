import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';
import Tooltip from 'react-bootstrap/Tooltip';

import { removeCookieClient, setCookieClient } from '../lib/client/cookie.js';
import type { PageContext } from '../lib/client/page-context.js';
import type { StaffUser } from '../lib/client/safe-db-types.js';

const Checkbox = ({
  label,
  checked,
  isAuthn,
}: {
  label: string;
  checked: boolean;
  isAuthn: boolean;
}) => {
  return (
    // no flex wrap
    <li class="list-group-item d-flex flex-nowrap">
      <input
        class="form-check-input me-1"
        type="checkbox"
        id={`${label}-${isAuthn ? 'authn' : 'authz'}`}
        checked={checked}
        disabled
      />
      <label class="form-check-label text-nowrap" for={`${label}-${isAuthn ? 'authn' : 'authz'}`}>
        {label}
      </label>
    </li>
  );
};

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
  ];

  // Only show the checkboxes that are different between authn and authz
  const authnPermissions = listedPermissions.filter(
    (permission) => authzData['authn_' + permission.key] !== authzData[permission.key],
  );
  const authzPermissions = listedPermissions.filter(
    (permission) => authzData['authn_' + permission.key] !== authzData[permission.key],
  );

  const authnCheckboxes = authnPermissions.map((permission) => (
    <Checkbox
      key={'authn_' + permission.key}
      label={permission.label}
      checked={authzData['authn_' + permission.key] ?? false}
      isAuthn={true}
    />
  ));
  const authzCheckboxes = authzPermissions.map((permission) => (
    <Checkbox
      key={permission.key}
      label={permission.label}
      checked={authzData[permission.key] ?? false}
      isAuthn={false}
    />
  ));

  return (
    <main id="content" class="container">
      <div class="card mb-4">
        <div class="card-header bg-danger text-white">Insufficient access</div>
        <div class="card-body">
          <h2 class="mb-3 h4">Effective user has insufficient access</h2>
          <p>
            The
            <OverlayTrigger
              placement="bottom"
              overlay={
                <Popover>
                  <Popover.Header>
                    {authzUser.name} ({authzUser.uid})
                  </Popover.Header>
                  <Popover.Body>
                    <ul class="list-group">
                      {authzCheckboxes}
                      <li class="list-group-item">Course role: {authzData.course_role}</li>
                      <li class="list-group-item">
                        Course instance role: {authzData.course_instance_role}
                      </li>
                    </ul>
                  </Popover.Body>
                </Popover>
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
              placement="bottom"
              overlay={
                <Popover>
                  <Popover.Header>
                    {authnUser.name} ({authnUser.uid})
                  </Popover.Header>
                  <Popover.Body>
                    <ul class="list-group">
                      {authnCheckboxes}
                      <li class="list-group-item">Course role: {authzData.authn_course_role}</li>
                      <li class="list-group-item">
                        Course instance role: {authzData.authn_course_instance_role}
                      </li>
                    </ul>
                  </Popover.Body>
                </Popover>
              }
            >
              <button type="button" class="btn btn-link link-secondary p-0 mx-1 align-baseline">
                your account
              </button>
            </OverlayTrigger>
            does.
          </p>
          <button type="button" class="btn btn-primary" onClick={clearEffectiveUserCookies}>
            Clear effective user
          </button>
        </div>
      </div>
    </main>
  );
}

AuthzAccessMismatch.displayName = 'AuthzAccessMismatch';
