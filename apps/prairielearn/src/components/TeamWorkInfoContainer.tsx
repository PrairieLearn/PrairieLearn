import { html } from '@prairielearn/html';

import type { TeamConfig } from '../lib/db-types.js';
import { idsEqual } from '../lib/id.js';
import type { TeamInfo } from '../lib/teams.js';

import { Modal } from './Modal.js';

export function TeamWorkInfoContainer({
  teamConfig,
  teamInfo,
  userCanAssignRoles,
  csrfToken,
}: {
  teamConfig: TeamConfig;
  teamInfo: TeamInfo;
  userCanAssignRoles: boolean;
  csrfToken: string;
}) {
  return html`
    <div class="container-fluid">
      <div class="row">
        <div class="col-sm bg-light py-4 px-4 border">
          <div><strong>Group name:</strong> <span id="team-name">${teamInfo.teamName}</span></div>
          ${teamConfig.student_authz_join
            ? html`
                <div>
                  <strong>Join code:</strong> <span id="join-code">${teamInfo.joinCode}</span>
                </div>
                <div class="mt-3">
                  ${(teamConfig.minimum ?? 0) > 1
                    ? html`
                        This is a group assessment. Use your join code to invite others to join the
                        group. A group must have
                        ${teamConfig.minimum === teamConfig.maximum
                          ? teamConfig.minimum
                          : teamConfig.maximum
                            ? `between ${teamConfig.minimum} and ${teamConfig.maximum}`
                            : `at least ${teamConfig.minimum}`}
                        students.
                      `
                    : html`
                        This assessment can be done individually or in groups. Use your join code if
                        you wish to invite others to join the group.
                        ${teamConfig.maximum
                          ? `A group must have no more than ${teamConfig.maximum} students.`
                          : ''}
                      `}
                </div>
              `
            : ''}
        </div>
        <div class="col-sm bg-light py-4 px-4 border">
          ${teamConfig.student_authz_leave
            ? html`
                <div class="text-end">
                  <button
                    type="button"
                    class="btn btn-danger"
                    data-bs-toggle="modal"
                    data-bs-target="#leaveTeamModal"
                  >
                    Leave the group
                  </button>
                </div>
                ${LeaveTeamModal({ csrfToken })}
              `
            : ''}
          <span id="team-member"><b>Group members: </b></span>
          ${teamInfo.teamMembers.map((user) =>
            teamConfig.has_roles
              ? html`
                  <li>
                    ${user.uid} -
                    ${teamInfo.rolesInfo?.roleAssignments[user.uid]
                      ?.map((a) => a.role_name)
                      .join(', ') || 'No role assigned'}
                  </li>
                `
              : html`<li>${user.uid}</li>`,
          )}
        </div>
      </div>
    </div>
    ${teamConfig.has_roles ? TeamRoleTable({ teamInfo, userCanAssignRoles, csrfToken }) : ''}
  `;
}

function LeaveTeamModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'leaveTeamModal',
    title: 'Confirm leave group',
    body: html`
      <p>Are you sure you want to leave the group?</p>
      <p>
        You will lose access to any work done by the group and you might not be able to re-join
        later.
      </p>
    `,
    footer: html`
      <input type="hidden" name="__action" value="leave_team" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
      <button id="leave-team" type="submit" class="btn btn-danger">Leave group</button>
    `,
  });
}

function TeamRoleTable({
  teamInfo,
  userCanAssignRoles,
  csrfToken,
}: {
  teamInfo: TeamInfo;
  userCanAssignRoles: boolean;
  csrfToken: string;
}) {
  const { rolesInfo, teamMembers, teamSize } = teamInfo;
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
                data-testid="team-role-config-problems"
              >
                ${roleConfigProblems}
              </span>
            `
          : ''}
      </summary>
      <div class="card-body">
        ${TeamRoleErrors({ rolesInfo, teamSize })}
        <p>
          This assessment contains group roles, which selectively allow students to view questions,
          submit answers, and change group role assignments.
        </p>

        <form id="role-select-form" name="role-select-form" method="POST">
          <div class="table-responsive mb-3">
            <table
              class="table table-bordered table-striped table-sm mb-0"
              aria-label="Group users and roles"
            >
              <thead>
                <tr>
                  <th>User</th>
                  <th>Roles</th>
                </tr>
              </thead>
              <tbody>
                ${teamMembers.map(
                  (user) => html`
                    <tr>
                      <td>${user.uid}</td>
                      <td>
                        <div class="d-flex gap-3">
                          ${rolesInfo.teamRoles.map(
                            (role) => html`
                              <label
                                class="d-inline-flex gap-1 ${rolesInfo.disabledRoles.includes(
                                  role.role_name,
                                )
                                  ? 'text-muted'
                                  : ''}"
                              >
                                <input
                                  type="checkbox"
                                  id="user_role_${role.id}-${user.id}"
                                  name="user_role_${role.id}-${user.id}"
                                  ${rolesInfo.disabledRoles.includes(role.role_name) ||
                                  !userCanAssignRoles
                                    ? 'disabled'
                                    : ''}
                                  ${
                                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                                    rolesInfo.roleAssignments[user.uid]?.some((a) =>
                                      idsEqual(a.team_role_id, role.id),
                                    )
                                      ? 'checked'
                                      : ''
                                  }
                                />
                                ${role.role_name}
                              </label>
                            `,
                          )}
                        </div>
                      </td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
          ${userCanAssignRoles
            ? html`
                <div class="d-flex justify-content-center">
                  <input type="hidden" name="__action" value="update_team_roles" />
                  <input type="hidden" name="__csrf_token" value="${csrfToken}" />
                  <button type="submit" class="btn btn-primary">Update Roles</button>
                </div>
              `
            : ''}
        </form>
      </div>
      <div class="card-footer small">
        <div class="table-responsive">
          <table
            class="table table-bordered table-striped table-sm w-auto mb-0"
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
              ${rolesInfo.teamRoles.map(
                (teamRole) => html`
                  <tr>
                    <td>${teamRole.role_name}</td>
                    <td>${teamRole.minimum ?? 0}</td>
                    <td>${teamRole.maximum ?? 'Unlimited'}</td>
                    <td>${teamRole.can_assign_roles ? 'Yes' : 'No'}</td>
                  </tr>
                `,
              )}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  `;
}

function TeamRoleErrors({
  rolesInfo,
  teamSize,
}: {
  rolesInfo: NonNullable<TeamInfo['rolesInfo']>;
  teamSize: number;
}) {
  return html`
    ${!rolesInfo.rolesAreBalanced
      ? html`
          <div class="alert alert-danger" role="alert">
            At least one student has too many roles. In a group with ${teamSize} students, every
            student must be assigned to exactly <strong>one</strong> role.
          </div>
        `
      : ''}
    ${rolesInfo.validationErrors.map(
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
    ${rolesInfo.usersWithoutRoles.length > 0
      ? html`
          <div class="alert alert-danger" role="alert">
            At least one user does not have a role. All users must have a role.
          </div>
        `
      : ''}
  `;
}
