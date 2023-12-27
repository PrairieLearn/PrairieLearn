import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { z } from 'zod';
import _ = require('lodash');

import * as sqldb from '@prairielearn/postgres';
import { idsEqual } from './id';
import { IdSchema } from './db-types';
const sql = sqldb.loadSqlEquiv(__filename);

const GroupConfigSchema = z.object({
  assessment_id: z.string().nullable(),
  course_instance_id: z.string(),
  date: z.date().nullable(),
  deleted_at: z.date().nullable(),
  has_roles: z.boolean().nullable(),
  id: z.string(),
  maximum: z.number().nullable(),
  minimum: z.number().nullable(),
  name: z.string().nullable(),
  student_authz_create: z.boolean().nullable(),
  student_authz_join: z.boolean().nullable(),
  student_authz_leave: z.boolean().nullable(),
});
type GroupConfig = z.infer<typeof GroupConfigSchema>;

const GroupMemberSchema = z.object({
  uid: z.string(),
  user_id: z.string(),
  group_name: z.string(),
  join_code: z.string(),
});
type GroupMember = z.infer<typeof GroupMemberSchema>;

const RoleAssignmentSchema = z.object({
  user_id: z.string(),
  uid: z.string(),
  role_name: z.string(),
  group_role_id: z.string(),
});
type RoleAssignment = z.infer<typeof RoleAssignmentSchema>;

const GroupRoleSchema = z.object({
  id: z.string(),
  role_name: z.string(),
  count: z.coerce.number(),
  maximum: z.number().nullable(),
  minimum: z.number().nullable(),
  can_assign_roles_at_start: z.boolean(),
  can_assign_roles_during_assessment: z.boolean(),
});
type GroupRole = z.infer<typeof GroupRoleSchema>;

const AssessmentLevelPermissionsSchema = z.object({
  can_assign_roles_at_start: z.boolean().nullable(),
  can_assign_roles_during_assessment: z.boolean().nullable(),
});
type AssessmentLevelPermissions = z.infer<typeof AssessmentLevelPermissionsSchema>;

interface RolesInfo {
  roleAssignments: Record<string, RoleAssignment[]>;
  groupRoles: GroupRole[];
  validationErrors: GroupRole[];
  disabledRoles: string[];
  rolesAreBalanced: boolean;
  usersWithoutRoles: GroupMember[];
}

interface GroupInfo {
  groupMembers: GroupMember[];
  groupSize: number;
  groupName: string;
  joinCode: string;
  start: boolean;
  rolesInfo?: RolesInfo;
}

interface GroupRoleAssignment {
  group_role_id: string;
  user_id: string;
}

/**
 * Gets the group config info for a given assessment id.
 */
export async function getGroupConfig(assessmentId: string): Promise<GroupConfig> {
  return await sqldb.queryRow(
    sql.get_group_config,
    { assessment_id: assessmentId },
    GroupConfigSchema,
  );
}

/**
 * Returns the group id for the user's current group in an assessment, if it exists.
 * Used in checking whether the user is in a group or not.
 */
export async function getGroupId(assessmentId: string, userId: string): Promise<string | null> {
  return await sqldb.queryOptionalRow(
    sql.get_group_id,
    { assessment_id: assessmentId, user_id: userId },
    IdSchema,
  );
}

export async function getGroupInfo(groupId: string, groupConfig: GroupConfig): Promise<GroupInfo> {
  const result = await sqldb.queryRows(
    sql.get_group_members,
    { group_id: groupId },
    GroupMemberSchema,
  );
  const needSize = (groupConfig.minimum ?? 0) - result.length;
  const groupInfo: GroupInfo = {
    groupMembers: result,
    groupSize: result.length,
    groupName: result[0].group_name,
    joinCode: result[0].group_name + '-' + result[0].join_code,
    start: needSize <= 0,
  };

  if (groupConfig.has_roles) {
    const rolesInfo = await getRolesInfo(groupId, groupInfo.groupMembers);
    groupInfo.start =
      groupInfo.start &&
      rolesInfo.rolesAreBalanced &&
      rolesInfo.validationErrors.length === 0 &&
      rolesInfo.usersWithoutRoles.length === 0;
    groupInfo.rolesInfo = rolesInfo;
  }

  return groupInfo;
}

/**
 * A helper function to getGroupInfo that returns a data structure containing info about an
 * assessment's group roles.
 */
async function getRolesInfo(groupId: string, groupMembers: GroupMember[]): Promise<RolesInfo> {
  // Get the current role assignments of the group
  const result = await sqldb.queryRows(
    sql.get_role_assignments,
    { group_id: groupId },
    RoleAssignmentSchema,
  );
  const roleAssignments = _.groupBy(result, 'uid');

  // Get info on all group roles for the assessment
  const groupRoles = await sqldb.queryRows(
    sql.get_group_roles,
    { group_id: groupId },
    GroupRoleSchema,
  );

  // Identify errors for any roles where count is not between max and min (if they exist)
  const validationErrors = groupRoles.filter(
    (role) =>
      (role.minimum && role.count < role.minimum) || (role.maximum && role.count > role.maximum),
  );

  // Identify any disabled roles based on group size, role minimums
  const minimumRolesToFill = _.sum(groupRoles.map((role) => role.minimum ?? 0));
  const optionalRoleNames = groupRoles
    .filter((role) => (role.minimum ?? 0) === 0)
    .map((role) => role.role_name);
  const disabledRoles = groupMembers.length <= minimumRolesToFill ? optionalRoleNames : [];

  // Check if any users have too many roles
  const rolesAreBalanced =
    groupMembers.length < minimumRolesToFill ||
    Object.values(roleAssignments).every((roles) => roles.length === 1);

  // Check if users have no roles
  const usersWithoutRoles = groupMembers.filter(
    (member) => roleAssignments[member.uid] === undefined,
  );

  return {
    roleAssignments,
    groupRoles,
    validationErrors,
    disabledRoles,
    rolesAreBalanced,
    usersWithoutRoles,
  };
}

export async function joinGroup(
  fullJoinCode: string,
  assessmentId: string,
  userId: string,
  authnUserId: string,
): Promise<void> {
  const splitJoinCode = fullJoinCode.split('-');
  if (splitJoinCode.length !== 2 || splitJoinCode[1].length !== 4) {
    // the join code input by user is not valid (not in format of groupname+4-character)
    flash('error', 'The join code has an incorrect format');
    return;
  }

  const groupName = splitJoinCode[0];
  const joinCode = splitJoinCode[1].toUpperCase();

  // This is a best-effort check to produce a nice error message. Even if this
  // fails due to a race condition, the `group_users_insert` sproc below will
  // validate that the user isn't already in a group.
  const existingGroupId = await getGroupId(assessmentId, userId);
  if (existingGroupId != null) {
    flash('error', 'You are already in another group.');
    return;
  }

  try {
    await sqldb.callAsync('group_users_insert', [
      assessmentId,
      userId,
      authnUserId,
      groupName,
      joinCode,
    ]);
  } catch (err) {
    flash(
      'error',
      `Failed to join the group with join code ${fullJoinCode}. It is already full or does not exist. Please try to join another one.`,
    );
  }
}

export async function createGroup(
  groupName: string,
  assessmentId: string,
  userId: string,
  authnUserId: string,
): Promise<void> {
  if (groupName.length > 30) {
    flash('error', 'The group name is too long. Use at most 30 alphanumerical characters.');
    return;
  }
  if (!groupName.match(/^[0-9a-zA-Z]+$/)) {
    flash(
      'error',
      'The group name is invalid. Only alphanumerical characters (letters and digits) are allowed.',
    );
    return;
  }

  // This is technically susceptible to race conditions. That won't be an
  // issue once we have a unique constraint for group membership.
  const existingGroupId = await getGroupId(assessmentId, userId);
  if (existingGroupId != null) {
    flash('error', 'You are already in a group.');
    return;
  }

  try {
    await sqldb.queryAsync(sql.create_group, {
      assessment_id: assessmentId,
      user_id: userId,
      authn_user_id: authnUserId,
      group_name: groupName,
    });
  } catch (err) {
    flash(
      'error',
      `Failed to create the group ${groupName}. It is already taken. Please try another one.`,
    );
  }
}

/**
 * @param {GroupInfo} groupInfo
 * @param {string} leavingUserId
 * @returns {GroupRoleAssignment[]}
 */
export function getGroupRoleReassignmentsAfterLeave(
  groupInfo: GroupInfo,
  leavingUserId: string,
): GroupRoleAssignment[] {
  // Get the roleIds of the leaving user that need to be re-assigned to other users
  const groupRoleAssignments = Object.values(groupInfo.rolesInfo?.roleAssignments ?? {}).flat();

  const leavingUserRoleIds = groupRoleAssignments
    .filter(({ user_id }) => idsEqual(user_id, leavingUserId))
    .map(({ group_role_id }) => group_role_id);

  const roleIdsToReassign =
    groupInfo.rolesInfo?.groupRoles
      .filter(
        (role) =>
          (role.minimum ?? 0) > 0 &&
          role.count <= (role.minimum ?? 0) &&
          leavingUserRoleIds.includes(role.id),
      )
      .map((role) => role.id) ?? [];

  // Get group user to group role assignments, excluding the leaving user
  const groupRoleAssignmentUpdates = groupRoleAssignments
    .filter(({ user_id }) => !idsEqual(user_id, leavingUserId))
    .map(({ user_id, group_role_id }) => ({ user_id, group_role_id }));

  for (const roleId of roleIdsToReassign) {
    // First, try to give the role to a user with no roles
    const userIdWithNoRoles = groupInfo.groupMembers.find(
      (m) =>
        !idsEqual(m.user_id, leavingUserId) &&
        groupRoleAssignmentUpdates.find(({ user_id }) => idsEqual(user_id, m.user_id)) ===
          undefined,
    )?.user_id;
    if (userIdWithNoRoles !== undefined) {
      groupRoleAssignmentUpdates.push({
        user_id: userIdWithNoRoles,
        group_role_id: roleId,
      });
      continue;
    }

    // Next, try to find a user with a non-required role and replace that role
    const idxToUpdate = groupRoleAssignmentUpdates.findIndex(({ group_role_id }) => {
      const roleMin =
        groupInfo.rolesInfo?.groupRoles.find((role) => idsEqual(role.id, group_role_id))?.minimum ??
        0;
      return roleMin === 0;
    });
    if (idxToUpdate !== -1) {
      groupRoleAssignmentUpdates[idxToUpdate].group_role_id = roleId;
      continue;
    }

    // Finally, try to give the role to a user that doesn't already have it
    const assigneeUserId = groupInfo.groupMembers.find(
      (m) =>
        !idsEqual(m.user_id, leavingUserId) &&
        !groupRoleAssignmentUpdates.some(
          (u) => idsEqual(u.group_role_id, roleId) && idsEqual(u.user_id, m.user_id),
        ),
    )?.user_id;
    if (assigneeUserId !== undefined) {
      groupRoleAssignmentUpdates.push({
        user_id: assigneeUserId,
        group_role_id: roleId,
      });
      continue;
    }
  }

  return groupRoleAssignmentUpdates;
}

export async function leaveGroup(
  assessmentId: string,
  userId: string,
  authnUserId: string,
): Promise<void> {
  await sqldb.runInTransactionAsync(async () => {
    const groupId = await getGroupId(assessmentId, userId);
    if (groupId === null) {
      throw new Error(
        "Couldn't access the user's group ID with the provided assessment and user IDs",
      );
    }
    const groupConfig = await getGroupConfig(assessmentId);

    if (groupConfig.has_roles) {
      const groupInfo = await getGroupInfo(groupId, groupConfig);

      // Reassign roles if there is more than 1 user
      const currentSize = groupInfo.groupMembers.length;
      if (currentSize > 1) {
        const groupRoleAssignmentUpdates = getGroupRoleReassignmentsAfterLeave(groupInfo, userId);
        await sqldb.queryAsync(sql.reassign_group_roles_after_leave, {
          assessment_id: assessmentId,
          role_assignments: JSON.stringify(groupRoleAssignmentUpdates),
          group_id: groupId,
        });

        // Groups with low enough size should only use required roles
        const minRolesToFill = _.sum(
          groupInfo.rolesInfo?.groupRoles.map((role) => role.minimum ?? 0),
        );
        if (currentSize - 1 <= minRolesToFill) {
          await sqldb.queryAsync(sql.delete_non_required_roles, {
            group_id: groupId,
            assessment_id: assessmentId,
          });
        }
      }
    }

    // Delete user from group and log
    await sqldb.queryAsync(sql.delete_group_users, {
      group_id: groupId,
      user_id: userId,
      authn_user_id: authnUserId,
    });
  });
}

export async function getAssessmentPermissions(
  assessmentId: string,
  userId: string,
): Promise<AssessmentLevelPermissions> {
  return await sqldb.queryRow(
    sql.get_assessment_level_permissions,
    { assessment_id: assessmentId, user_id: userId },
    AssessmentLevelPermissionsSchema,
  );
}

/**
 * Updates the role assignments of users in a group, given the output from groupRoleSelectTable.ejs.
 */
export async function updateGroupRoles(
  requestBody: Record<string, any>,
  assessmentId: string,
  userId: string,
  authnUserId: string,
) {
  await sqldb.runInTransactionAsync(async () => {
    const groupId = await getGroupId(assessmentId, userId);
    if (groupId === null) {
      throw new Error(
        "Couldn't access the user's group ID with the provided assessment and user IDs",
      );
    }

    const permissions = await getAssessmentPermissions(assessmentId, userId);
    if (!permissions.can_assign_roles_at_start) {
      throw error.make(
        403,
        'User does not have permission to assign roles at the start of this assessment',
      );
    }

    const groupConfig = await getGroupConfig(assessmentId);
    const groupInfo = await getGroupInfo(groupId, groupConfig);

    // Convert form data to valid input format for a SQL function
    const roleKeys = Object.keys(requestBody).filter((key) => key.startsWith('user_role_'));
    const roleAssignments = roleKeys.map((roleKey) => {
      const [roleId, userId] = roleKey.replace('user_role_', '').split('-');
      return {
        group_id: groupId,
        user_id: userId,
        group_role_id: roleId,
      };
    });

    // If no one is being given a role with assigner permissions, give that role to the current user
    const assignerRoleIds =
      groupInfo.rolesInfo?.groupRoles
        .filter((role) => role.can_assign_roles_at_start)
        .map((role) => role.id) ?? [];
    const assignerRoleFound = roleAssignments.some((roleAssignment) =>
      assignerRoleIds.includes(roleAssignment.group_role_id),
    );
    if (!assignerRoleFound) {
      roleAssignments.push({
        group_id: groupId,
        user_id: userId,
        group_role_id: assignerRoleIds[0],
      });
    }

    await sqldb.queryAsync(sql.update_group_roles, {
      group_id: groupId,
      role_assignments: JSON.stringify(roleAssignments),
      user_id: userId,
      authn_user_id: authnUserId,
    });
  });
}

/**
 * Delete all groups for the given assessment.
 */
export async function deleteAllGroups(assessmentId: string, authnUserId: string) {
  await sqldb.queryAsync(sql.delete_all_groups, {
    assessment_id: assessmentId,
    authn_user_id: authnUserId,
  });
}
