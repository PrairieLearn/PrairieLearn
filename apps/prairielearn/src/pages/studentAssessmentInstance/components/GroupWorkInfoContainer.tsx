import { useState } from 'react';
import { Modal } from 'react-bootstrap';

import type { ClientGroupConfig, ClientGroupInfo } from './types.js';

export function GroupWorkInfoContainer({
  groupConfig,
  groupInfo,
  userCanAssignRoles,
  csrfToken,
}: {
  groupConfig: ClientGroupConfig;
  groupInfo: ClientGroupInfo;
  userCanAssignRoles: boolean;
  csrfToken: string;
}) {
  return (
    <>
      <div className="container-fluid">
        <div className="row">
          <div className="col-sm bg-light py-4 px-4 border">
            <div>
              <strong>Group name:</strong> <span id="group-name">{groupInfo.groupName}</span>
            </div>
            {groupConfig.studentAuthzJoin && (
              <>
                <div>
                  <strong>Join code:</strong> <span id="join-code">{groupInfo.joinCode}</span>
                </div>
                <div className="mt-3">
                  {(groupConfig.minimum ?? 0) > 1 ? (
                    <>
                      This is a group assessment. Use your join code to invite others to join the
                      group. A group must have{' '}
                      {groupConfig.minimum === groupConfig.maximum
                        ? groupConfig.minimum
                        : groupConfig.maximum
                          ? `between ${groupConfig.minimum} and ${groupConfig.maximum}`
                          : `at least ${groupConfig.minimum}`}{' '}
                      students.
                    </>
                  ) : (
                    <>
                      This assessment can be done individually or in groups. Use your join code if
                      you wish to invite others to join the group.
                      {groupConfig.maximum
                        ? ` A group must have no more than ${groupConfig.maximum} students.`
                        : ''}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="col-sm bg-light py-4 px-4 border">
            {groupConfig.studentAuthzLeave && <LeaveGroupButton csrfToken={csrfToken} />}
            <span id="group-member">
              <b>Group members: </b>
            </span>
            {groupInfo.groupMembers.map((user) => (
              <li key={user.uid}>
                {groupConfig.hasRoles
                  ? `${user.uid} - ${groupInfo.rolesInfo?.roleAssignments[user.uid]?.map((a) => a.roleName).join(', ') || 'No role assigned'}`
                  : user.uid}
              </li>
            ))}
          </div>
        </div>
      </div>
      {groupConfig.hasRoles && groupInfo.rolesInfo && (
        <GroupRoleTable
          groupInfo={groupInfo}
          userCanAssignRoles={userCanAssignRoles}
          csrfToken={csrfToken}
        />
      )}
    </>
  );
}

function LeaveGroupButton({ csrfToken }: { csrfToken: string }) {
  const [show, setShow] = useState(false);

  return (
    <>
      <form id="leave-group-form" method="POST" hidden>
        <input type="hidden" name="__action" value="leave_group" />
        <input type="hidden" name="__csrf_token" value={csrfToken} />
      </form>
      <div className="text-end">
        <button type="button" className="btn btn-danger" onClick={() => setShow(true)}>
          Leave the group
        </button>
      </div>
      <Modal show={show} onHide={() => setShow(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm leave group</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Are you sure you want to leave the group?</p>
          <p>
            You will lose access to any work done by the group and you might not be able to re-join
            later.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary" onClick={() => setShow(false)}>
            Close
          </button>
          <button id="leave-group" type="submit" form="leave-group-form" className="btn btn-danger">
            Leave group
          </button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

function GroupRoleTable({
  groupInfo,
  userCanAssignRoles,
  csrfToken,
}: {
  groupInfo: ClientGroupInfo;
  userCanAssignRoles: boolean;
  csrfToken: string;
}) {
  const rolesInfo = groupInfo.rolesInfo!;
  const roleConfigProblems =
    rolesInfo.validationErrors.length +
    (rolesInfo.usersWithoutRoles.length > 0 ? 1 : 0) +
    (rolesInfo.rolesAreBalanced ? 0 : 1);

  return (
    <>
      {roleConfigProblems > 0 && (
        <div className="alert alert-danger mt-2" role="alert">
          Your group&apos;s role configuration is currently invalid. Please review the role
          requirements and{' '}
          {userCanAssignRoles
            ? 'assign a valid role configuration'
            : 'ask a user with an assigner role to update the role configuration'}
          . Question submissions are disabled until the role configuration is valid.
        </div>
      )}
      <details className="card mb-2">
        <summary className="card-header bg-secondary text-light">
          {userCanAssignRoles ? 'Manage group roles' : 'View group roles'}
          {roleConfigProblems > 0 && (
            <>
              {' '}
              <span
                className="badge rounded-pill text-bg-danger"
                data-testid="group-role-config-problems"
              >
                {roleConfigProblems}
              </span>
            </>
          )}
        </summary>
        <div className="card-body">
          <GroupRoleErrors rolesInfo={rolesInfo} groupSize={groupInfo.groupSize} />
          <p>
            This assessment contains group roles, which selectively allow students to view
            questions, submit answers, and change group role assignments.
          </p>

          <form id="role-select-form" name="role-select-form" method="POST">
            <div className="table-responsive mb-3">
              <table
                className="table table-bordered table-striped table-sm mb-0"
                aria-label="Group users and roles"
              >
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Roles</th>
                  </tr>
                </thead>
                <tbody>
                  {groupInfo.groupMembers.map((user) => (
                    <tr key={user.uid}>
                      <td>{user.uid}</td>
                      <td>
                        <div className="d-flex gap-3">
                          {rolesInfo.groupRoles.map((role) => (
                            <label
                              key={role.id}
                              className={`d-inline-flex gap-1 ${rolesInfo.disabledRoles.includes(role.roleName) ? 'text-muted' : ''}`}
                            >
                              <input
                                type="checkbox"
                                id={`user_role_${role.id}-${user.id}`}
                                name={`user_role_${role.id}-${user.id}`}
                                disabled={
                                  rolesInfo.disabledRoles.includes(role.roleName) ||
                                  !userCanAssignRoles
                                }
                                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- index access may be undefined at runtime
                                defaultChecked={rolesInfo.roleAssignments[user.uid]?.some(
                                  (a) => a.teamRoleId === role.id,
                                )}
                              />
                              {role.roleName}
                            </label>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {userCanAssignRoles && (
              <div className="d-flex justify-content-center">
                <input type="hidden" name="__action" value="update_group_roles" />
                <input type="hidden" name="__csrf_token" value={csrfToken} />
                <button type="submit" className="btn btn-primary">
                  Update Roles
                </button>
              </div>
            )}
          </form>
        </div>
        <div className="card-footer small">
          <div className="table-responsive">
            <table
              className="table table-bordered table-striped table-sm w-auto mb-0"
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
                {rolesInfo.groupRoles.map((groupRole) => (
                  <tr key={groupRole.id}>
                    <td>{groupRole.roleName}</td>
                    <td>{groupRole.minimum ?? 0}</td>
                    <td>{groupRole.maximum ?? 'Unlimited'}</td>
                    <td>{groupRole.canAssignRoles ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </>
  );
}

function GroupRoleErrors({
  rolesInfo,
  groupSize,
}: {
  rolesInfo: NonNullable<ClientGroupInfo['rolesInfo']>;
  groupSize: number;
}) {
  return (
    <>
      {!rolesInfo.rolesAreBalanced && (
        <div className="alert alert-danger" role="alert">
          At least one student has too many roles. In a group with {groupSize} students, every
          student must be assigned to exactly <strong>one</strong> role.
        </div>
      )}
      {rolesInfo.validationErrors.map(({ roleName, count, minimum, maximum }) => (
        <div key={roleName} className="alert alert-danger" role="alert">
          {minimum != null && count < minimum ? (
            <>
              {minimum - count} more {minimum - count === 1 ? 'student needs' : 'students need'} to
              be assigned to the role &quot;{roleName}&quot;
            </>
          ) : maximum != null && count > maximum ? (
            <>
              {count - maximum} less {count - maximum === 1 ? 'student needs' : 'students need'} to
              be assigned to the role &quot;{roleName}&quot;
            </>
          ) : null}
          {maximum === minimum ? (
            <>
              {' '}
              ({count} assigned, {minimum} expected).{' '}
            </>
          ) : maximum == null ? (
            <>
              {' '}
              ({count} assigned, at least {minimum} expected).{' '}
            </>
          ) : (
            <>
              {' '}
              ({count} assigned, between {minimum ?? 0} and {maximum} expected).{' '}
            </>
          )}
        </div>
      ))}
      {rolesInfo.usersWithoutRoles.length > 0 && (
        <div className="alert alert-danger" role="alert">
          At least one user does not have a role. All users must have a role.
        </div>
      )}
    </>
  );
}
