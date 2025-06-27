import { html } from '@prairielearn/html';

import type { GroupConfig } from '../lib/db-types.js';
import type { GroupInfo } from '../lib/groups.js';
import { idsEqual } from '../lib/id.js';

import { Modal } from './Modal.html.js';

export function GroupWorkInfoContainer({
  groupConfig,
  groupInfo,
  userCanAssignRoles,
  csrfToken,
}: {
  groupConfig: GroupConfig;
  groupInfo: GroupInfo;
  userCanAssignRoles: boolean;
  csrfToken: string;
}) {
  return html`
    <div class="container-fluid">
      <div class="row">
        <div class="col-sm bg-light py-4 px-4 border">
          <div>
            <strong>Group name:</strong> <span id="group-name">${groupInfo.groupName}</span>
          </div>
          ${groupConfig.student_authz_join
            ? html`
                <div>
                  <strong>Join code:</strong> <span id="join-code">${groupInfo.joinCode}</span>
                </div>
                <div class="mt-3">
                  ${(groupConfig.minimum ?? 0) > 1
                    ? html`
                        This is a group assessment. Use your join code to invite others to join the
                        group. A group must have
                        ${groupConfig.minimum === groupConfig.maximum
                          ? groupConfig.minimum
                          : groupConfig.maximum
                            ? `between ${groupConfig.minimum} and ${groupConfig.maximum}`
                            : `at least ${groupConfig.minimum}`}
                        students.
                      `
                    : html`
                        This assessment can be done individually or in groups. Use your join code if
                        you wish to invite others to join the group.
                        ${groupConfig.maximum
                          ? `A group must have no more than ${groupConfig.maximum} students.`
                          : ''}
                      `}
                </div>
              `
            : ''}
        </div>
        <div class="col-sm bg-light py-4 px-4 border">
          ${groupConfig.student_authz_leave
            ? html`
                <div class="text-end">
                  <button
                    type="button"
                    class="btn btn-danger"
                    data-bs-toggle="modal"
                    data-bs-target="#leaveGroupModal"
                  >
                    Leave the Group
                  </button>
                </div>
                ${LeaveGroupModal({ csrfToken })}
              `
            : ''}
          <span id="group-member"><b>Group members: </b></span>
          ${groupInfo.groupMembers.map((user) =>
            groupConfig.has_roles
              ? html`
                  <li>
                    ${user.uid} -
                    ${groupInfo.rolesInfo?.roleAssignments[user.uid]
                      ?.map((a) => a.role_name)
                      .join(', ') || 'No role assigned'}
                  </li>
                `
              : html`<li>${user.uid}</li>`,
          )}
        </div>
      </div>
    </div>
    ${groupConfig.has_roles ? GroupRoleTable({ groupInfo, userCanAssignRoles, csrfToken }) : ''}
  `;
}

function LeaveGroupModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'leaveGroupModal',
    title: 'Confirm leave group',
    body: html`
      <p>Are you sure you want to leave the group?</p>
      <p>
        You will lose access to any work done by the group and you might not be able to re-join
        later.
      </p>
    `,
    footer: html`
      <input type="hidden" name="__action" value="leave_group" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
      <button id="leave-group" type="submit" class="btn btn-danger">Leave group</button>
    `,
  });
}

function GroupRoleTable({
  groupInfo,
  userCanAssignRoles,
  csrfToken,
}: {
  groupInfo: GroupInfo;
  userCanAssignRoles: boolean;
  csrfToken: string;
}) {
  const { rolesInfo, groupMembers, groupSize } = groupInfo;
  if (!rolesInfo) return '';
  const roleConfigProblems =
    rolesInfo.validationErrors.length +
    (rolesInfo.usersWithoutRoles.length > 0 ? 1 : 0) +
    (rolesInfo.rolesAreBalanced ? 0 : 1);
  return html`
    ${roleConfigProblems > 0
      ? html`
          <div class="alert alert-danger mt-2" role="alert">
            Your group's role configuration is currently invalid. Please review the role
            requirements and
            ${userCanAssignRoles
              ? 'assign a valid role configuration'
              : 'ask a user with an assigner role to update the role configuration'}.
            Question submissions are disabled until the role configuration is valid.
          </div>
        `
      : ''}
    <details class="card mb-2">
      <summary class="card-header bg-secondary text-light">
        ${userCanAssignRoles ? 'Manage group roles' : 'View group roles'}
        ${roleConfigProblems > 0
          ? html`
              <span
                class="badge rounded-pill text-bg-danger"
                data-testid="group-role-config-problems"
              >
                ${roleConfigProblems}
              </span>
            `
          : ''}
      </summary>
      <div class="card-body">
        ${GroupRoleErrors({ rolesInfo, groupSize })}
        <p>
          This assessment contains group roles, which selectively allow students to view questions,
          submit answers, and change group role assignments.
        </p>

        <form id="role-select-form" name="role-select-form" method="POST">
          <table
            class="table table-bordered table-striped table-sm"
            aria-label="Group users and roles"
          >
            <thead>
              <tr>
                <th>User</th>
                <th>Roles</th>
              </tr>
            </thead>
            <tbody>
              ${groupMembers.map(
                (user) => html`
                  <tr>
                    <td>${user.uid}</td>
                    <td>
                      ${rolesInfo.groupRoles.map(
                        (role) => html`
                          <label
                            class="ms-2 ${rolesInfo.disabledRoles.includes(role.role_name)
                              ? 'text-muted'
                              : ''}"
                          >
                            <input
                              type="checkbox"
                              id="user_role_${role.id}-${user.user_id}"
                              name="user_role_${role.id}-${user.user_id}"
                              ${rolesInfo.disabledRoles.includes(role.role_name) ||
                              !userCanAssignRoles
                                ? 'disabled'
                                : ''}
                              ${rolesInfo.roleAssignments[user.uid]?.some((a) =>
                                idsEqual(a.group_role_id, role.id),
                              )
                                ? 'checked'
                                : ''}
                            />
                            ${role.role_name}
                          </label>
                        `,
                      )}
                    </td>
                  </tr>
                `,
              )}
            </tbody>
          </table>
          ${userCanAssignRoles
            ? html`
                <div class="d-flex justify-content-center">
                  <input type="hidden" name="__action" value="update_group_roles" />
                  <input type="hidden" name="__csrf_token" value="${csrfToken}" />
                  <button type="submit" class="btn btn-primary">Update Roles</button>
                </div>
              `
            : ''}
        </form>
      </div>
      <div class="card-footer small">
        <table
          class="table table-bordered table-striped table-sm w-auto"
          aria-label="Role requirements and restrictions"
        >
          <thead>
            <tr>
              <th>Role</th>
              <th>Minimum assignments</th>
              <th>Maximum assignments</th>
              <th>Can assign roles</th>
            </tr>
          </thead>
          <tbody>
            ${rolesInfo.groupRoles.map(
              (groupRole) => html`
                <tr>
                  <td>${groupRole.role_name}</td>
                  <td>${groupRole.minimum ?? 0}</td>
                  <td>${groupRole.maximum ?? 'Unlimited'}</td>
                  <td>${groupRole.can_assign_roles ? 'Yes' : 'No'}</td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

function GroupRoleErrors({
  rolesInfo,
  groupSize,
}: {
  rolesInfo: NonNullable<GroupInfo['rolesInfo']>;
  groupSize: number;
}) {
  return html`
    ${!rolesInfo.rolesAreBalanced
      ? html`
          <div class="alert alert-danger" role="alert">
            At least one student has too many roles. In a group with ${groupSize} students, every
            student must be assigned to exactly <strong>one</strong> role.
          </div>
        `
      : ''}
    ${rolesInfo.validationErrors?.map(
      ({ role_name, count, minimum, maximum }) => html`
        <div class="alert alert-danger" role="alert">
          ${minimum != null && count < minimum
            ? html`
                ${minimum - count} more ${minimum - count === 1 ? 'student needs' : 'students need'}
                to be assigned to the role "${role_name}"
              `
            : maximum != null && count > maximum
              ? html`
                  ${count - maximum} less
                  ${count - maximum === 1 ? 'student needs' : 'students need'} to be assigned to the
                  role "${role_name}"
                `
              : ''}
          ${maximum === minimum
            ? html` (${count} assigned, ${minimum} expected). `
            : maximum == null
              ? html` (${count} assigned, at least ${minimum} expected). `
              : html` (${count} assigned, between ${minimum ?? 0} and ${maximum} expected). `}
        </div>
      `,
    )}
    ${rolesInfo.usersWithoutRoles?.length > 0
      ? html`
          <div class="alert alert-danger" role="alert">
            At least one user does not have a role. All users must have a role.
          </div>
        `
      : ''}
  `;
}
