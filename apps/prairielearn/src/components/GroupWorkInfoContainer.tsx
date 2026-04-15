import type { RoleAssignment } from '../lib/groups.shared.js';

interface GroupWorkInfoGroupConfig {
  has_roles: boolean;
  maximum: number | null;
  minimum: number | null;
  student_authz_join: boolean | null;
  student_authz_leave: boolean | null;
}

interface GroupWorkInfoRolesInfo {
  roleAssignments: Record<string, RoleAssignment[]>;
  groupRoles: {
    id: string;
    role_name: string;
    minimum: number | null;
    maximum: number | null;
    can_assign_roles: boolean | null;
    count: number;
  }[];
  validationErrors: {
    role_name: string;
    minimum: number | null;
    maximum: number | null;
    count: number;
  }[];
  disabledRoles: string[];
  rolesAreBalanced: boolean;
  usersWithoutRoles: { uid: string }[];
}

interface GroupWorkInfoGroupInfo {
  groupName: string;
  joinCode: string;
  groupMembers: { uid: string; id: string }[];
  groupSize: number;
  rolesInfo?: GroupWorkInfoRolesInfo;
}

export function GroupWorkInfoContainer({
  groupConfig,
  groupInfo,
  userCanAssignRoles,
  csrfToken,
}: {
  groupConfig: GroupWorkInfoGroupConfig;
  groupInfo: GroupWorkInfoGroupInfo;
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
            {groupConfig.student_authz_join && (
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
            {groupConfig.student_authz_leave && <LeaveGroupButton csrfToken={csrfToken} />}
            <span id="group-member">
              <b>Group members: </b>
            </span>
            <ul className="list-unstyled mb-0">
              {groupInfo.groupMembers.map((member) => (
                <li key={member.uid}>
                  {groupConfig.has_roles
                    ? `${member.uid} - ${groupInfo.rolesInfo?.roleAssignments[member.uid]?.map((a) => a.role_name).join(', ') || 'No role assigned'}`
                    : member.uid}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {groupConfig.has_roles && groupInfo.rolesInfo && (
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
  return (
    <>
      <div className="text-end">
        <button
          type="button"
          className="btn btn-danger"
          data-bs-toggle="modal"
          data-bs-target="#leaveGroupModal"
        >
          Leave the group
        </button>
      </div>
      <form method="POST" autoComplete="off">
        <div
          className="modal fade"
          tabIndex={-1}
          role="dialog"
          id="leaveGroupModal"
          aria-labelledby="leaveGroupModal-title"
        >
          <div className="modal-dialog modal-lg" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h2 className="modal-title h4" id="leaveGroupModal-title">
                  Confirm leave group
                </h2>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to leave the group?</p>
                <p>
                  You will lose access to any work done by the group and you might not be able to
                  re-join later.
                </p>
              </div>
              <div className="modal-footer">
                <input type="hidden" name="__action" value="leave_group" />
                <input type="hidden" name="__csrf_token" value={csrfToken} />
                <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">
                  Close
                </button>
                <button id="leave-group" type="submit" className="btn btn-danger">
                  Leave group
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}

function GroupRoleTable({
  groupInfo,
  userCanAssignRoles,
  csrfToken,
}: {
  groupInfo: GroupWorkInfoGroupInfo;
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
                  {groupInfo.groupMembers.map((member) => (
                    <tr key={member.uid}>
                      <td>{member.uid}</td>
                      <td>
                        <div className="d-flex gap-3">
                          {rolesInfo.groupRoles.map((role) => (
                            <label
                              key={role.id}
                              className={`d-inline-flex gap-1 ${rolesInfo.disabledRoles.includes(role.role_name) ? 'text-muted' : ''}`}
                            >
                              <input
                                type="checkbox"
                                id={`user_role_${role.id}-${member.id}`}
                                name={`user_role_${role.id}-${member.id}`}
                                disabled={
                                  rolesInfo.disabledRoles.includes(role.role_name) ||
                                  !userCanAssignRoles
                                }
                                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- index access may be undefined at runtime
                                defaultChecked={rolesInfo.roleAssignments[member.uid]?.some(
                                  (a) => a.team_role_id === role.id,
                                )}
                              />
                              {role.role_name}
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
                  Update roles
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
                    <td>{groupRole.role_name}</td>
                    <td>{groupRole.minimum ?? 0}</td>
                    <td>{groupRole.maximum ?? 'Unlimited'}</td>
                    <td>{groupRole.can_assign_roles ? 'Yes' : 'No'}</td>
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
  rolesInfo: GroupWorkInfoRolesInfo;
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
      {rolesInfo.validationErrors.map(({ role_name, count, minimum, maximum }) => (
        <div key={role_name} className="alert alert-danger" role="alert">
          {minimum != null && count < minimum ? (
            <>
              {minimum - count} more {minimum - count === 1 ? 'student needs' : 'students need'} to
              be assigned to the role &quot;{role_name}&quot;
            </>
          ) : maximum != null && count > maximum ? (
            <>
              {count - maximum} less {count - maximum === 1 ? 'student needs' : 'students need'} to
              be assigned to the role &quot;{role_name}&quot;
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
