import { z } from 'zod';

import { GroupRoleSchema, GroupSchema, type GroupUserRole, type User } from './db-types.js';
import { idsEqual } from './id.js';

export const RoleAssignmentSchema = z.object({
  user_id: z.string(),
  uid: z.string(),
  role_name: z.string(),
  team_role_id: z.string(),
});
export type RoleAssignment = z.infer<typeof RoleAssignmentSchema>;

export const GroupRoleWithCountSchema = GroupRoleSchema.extend({
  count: z.number(),
});
export type GroupRoleWithCount = z.infer<typeof GroupRoleWithCountSchema>;

export interface RolesInfo {
  roleAssignments: Record<string, RoleAssignment[]>;
  groupRoles: GroupRoleWithCount[];
  validationErrors: GroupRoleWithCount[];
  disabledRoles: string[];
  rolesAreBalanced: boolean;
  usersWithoutRoles: User[];
}

export interface GroupInfo {
  groupMembers: User[];
  groupSize: number;
  groupName: string;
  joinCode: string;
  start: boolean;
  rolesInfo?: RolesInfo;
}

type GroupRoleAssignment = Pick<GroupUserRole, 'team_role_id' | 'user_id'>;

export const GroupForUpdateSchema = GroupSchema.extend({
  cur_size: z.number(),
  max_size: z.number().nullable(),
  has_roles: z.boolean(),
});

export function getRoleNamesForUser(groupInfo: GroupInfo, user: User): string[] {
  return groupInfo.rolesInfo?.roleAssignments[user.uid]?.map((r) => r.role_name) ?? ['None'];
}

export function canUserAssignGroupRoles(groupInfo: GroupInfo, user_id: string): boolean {
  const assignerRoles =
    groupInfo.rolesInfo?.groupRoles
      .filter((role) => role.can_assign_roles)
      .map((role) => role.id) ?? [];
  const assignerUsers = Object.values(groupInfo.rolesInfo?.roleAssignments ?? {})
    .flat()
    .filter((assignment) => assignerRoles.some((id) => idsEqual(id, assignment.team_role_id)))
    .map((assignment) => assignment.user_id);
  if (assignerUsers.length === 0) {
    // If none of the current users in the group has an assigner role, allow any
    // user to assign roles by default
    return true;
  } else {
    // Otherwise, check if current user is in the list of assigner users
    return assignerUsers.some((id) => idsEqual(id, user_id));
  }
}

export function getGroupRoleReassignmentsAfterLeave(
  groupInfo: GroupInfo,
  leavingUserId: string,
): GroupRoleAssignment[] {
  // Get the roleIds of the leaving user that need to be re-assigned to other users
  const groupRoleAssignments = Object.values(groupInfo.rolesInfo?.roleAssignments ?? {}).flat();

  const leavingUserRoleIds = new Set(
    groupRoleAssignments
      .filter(({ user_id }) => idsEqual(user_id, leavingUserId))
      .map(({ team_role_id }) => team_role_id),
  );

  const roleIdsToReassign =
    groupInfo.rolesInfo?.groupRoles
      .filter(
        (role) =>
          (role.minimum ?? 0) > 0 &&
          role.count <= (role.minimum ?? 0) &&
          leavingUserRoleIds.has(role.id),
      )
      .map((role) => role.id) ?? [];

  // Get group user to group role assignments, excluding the leaving user
  const groupRoleAssignmentUpdates = groupRoleAssignments
    .filter(({ user_id }) => !idsEqual(user_id, leavingUserId))
    .map(({ user_id, team_role_id }) => ({ user_id, team_role_id }));

  for (const roleId of roleIdsToReassign) {
    // First, try to give the role to a user with no roles
    const userIdWithNoRoles = groupInfo.groupMembers.find(
      (m) =>
        !idsEqual(m.id, leavingUserId) &&
        !groupRoleAssignmentUpdates.some(({ user_id }) => idsEqual(user_id, m.id)),
    )?.id;
    if (userIdWithNoRoles !== undefined) {
      groupRoleAssignmentUpdates.push({
        user_id: userIdWithNoRoles,
        team_role_id: roleId,
      });
      continue;
    }

    // Next, try to find a user with a non-required role and replace that role
    const idxToUpdate = groupRoleAssignmentUpdates.findIndex(({ team_role_id }) => {
      const roleMin =
        groupInfo.rolesInfo?.groupRoles.find((role) => idsEqual(role.id, team_role_id))?.minimum ??
        0;
      return roleMin === 0;
    });
    if (idxToUpdate !== -1) {
      groupRoleAssignmentUpdates[idxToUpdate].team_role_id = roleId;
      continue;
    }

    // Finally, try to give the role to a user that doesn't already have it
    const assigneeUserId = groupInfo.groupMembers.find(
      (m) =>
        !idsEqual(m.id, leavingUserId) &&
        !groupRoleAssignmentUpdates.some(
          (u) => idsEqual(u.team_role_id, roleId) && idsEqual(u.user_id, m.id),
        ),
    )?.id;
    if (assigneeUserId !== undefined) {
      groupRoleAssignmentUpdates.push({
        user_id: assigneeUserId,
        team_role_id: roleId,
      });
      continue;
    }
  }

  return groupRoleAssignmentUpdates;
}
