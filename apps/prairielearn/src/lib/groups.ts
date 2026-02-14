import { groupBy, sum } from 'es-toolkit';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { userIsInstructorInAnyCourse } from '../models/course-permissions.js';
import { selectCourseById } from '../models/course.js';
import { selectOptionalEnrollmentByUserId } from '../models/enrollment.js';
import { selectOptionalUserByUid } from '../models/user.js';

import type { AuthzData } from './authz-data-lib.js';
import {
  type Assessment,
  type CourseInstance,
  type Group,
  type GroupConfig,
  GroupConfigSchema,
  GroupRoleSchema,
  GroupSchema,
  type GroupUserRole,
  type User,
  UserSchema,
} from './db-types.js';
import { idsEqual } from './id.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export class GroupOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroupOperationError';
  }
}

const RoleAssignmentSchema = z.object({
  user_id: z.string(),
  uid: z.string(),
  role_name: z.string(),
  team_role_id: z.string(),
});
export type RoleAssignment = z.infer<typeof RoleAssignmentSchema>;

const GroupRoleWithCountSchema = GroupRoleSchema.extend({
  count: z.number(),
});
export type GroupRoleWithCount = z.infer<typeof GroupRoleWithCountSchema>;

interface RolesInfo {
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

const GroupForUpdateSchema = GroupSchema.extend({
  cur_size: z.number(),
  max_size: z.number().nullable(),
  has_roles: z.boolean(),
});

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

export async function getGroupInfo(group_id: string, groupConfig: GroupConfig): Promise<GroupInfo> {
  const group = await sqldb.queryRow(sql.select_group, { group_id }, GroupSchema);
  const groupMembers = await sqldb.queryRows(sql.select_group_members, { group_id }, UserSchema);

  const needSize = (groupConfig.minimum ?? 0) - groupMembers.length;
  const groupInfo: GroupInfo = {
    groupMembers,
    groupSize: groupMembers.length,
    groupName: group.name,
    joinCode: group.name + '-' + group.join_code,
    start: needSize <= 0,
  };

  if (groupConfig.has_roles) {
    const rolesInfo = await getRolesInfo(group_id, groupInfo.groupMembers);
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
async function getRolesInfo(groupId: string, groupMembers: User[]): Promise<RolesInfo> {
  // Get the current role assignments of the group
  const result = await sqldb.queryRows(
    sql.get_role_assignments,
    { group_id: groupId },
    RoleAssignmentSchema,
  );
  const roleAssignments = groupBy(result, (result) => result.uid);

  // Get info on all group roles for the assessment
  const groupRoles = await sqldb.queryRows(
    sql.get_group_roles,
    { group_id: groupId },
    GroupRoleWithCountSchema,
  );

  // Identify errors for any roles where count is not between max and min (if they exist)
  const validationErrors = groupRoles.filter(
    (role) =>
      (role.minimum && role.count < role.minimum) || (role.maximum && role.count > role.maximum),
  );

  // Identify any disabled roles based on group size, role minimums
  const minimumRolesToFill = sum(groupRoles.map((role) => role.minimum ?? 0));
  const optionalRoleNames = groupRoles
    .filter((role) => (role.minimum ?? 0) === 0)
    .map((role) => role.role_name);
  const disabledRoles = groupMembers.length <= minimumRolesToFill ? optionalRoleNames : [];

  // Check if any users have too many roles
  const rolesAreBalanced =
    groupMembers.length < minimumRolesToFill ||
    Object.values(roleAssignments).every((roles) => roles.length === 1);

  // Check if users have no roles
  const usersWithoutRoles = groupMembers.filter((member) => !(member.uid in roleAssignments));

  return {
    roleAssignments,
    groupRoles,
    validationErrors,
    disabledRoles,
    rolesAreBalanced,
    usersWithoutRoles,
  };
}

const QuestionGroupPermissionsSchema = z.object({
  can_submit: z.boolean(),
  can_view: z.boolean(),
});
export type QuestionGroupPermissions = z.infer<typeof QuestionGroupPermissionsSchema>;

/**
 * This function assumes that the group has roles, so any caller must ensure
 * that it is only called in that scenario
 */
export async function getQuestionGroupPermissions(
  instance_question_id: string,
  group_id: string,
  user_id: string,
): Promise<QuestionGroupPermissions> {
  const userPermissions = await sqldb.queryOptionalRow(
    sql.select_question_permissions,
    { instance_question_id, group_id, user_id },
    QuestionGroupPermissionsSchema,
  );
  return userPermissions ?? { can_submit: false, can_view: false };
}

export async function getUserRoles(group_id: string, user_id: string) {
  return await sqldb.queryRows(sql.select_user_roles, { group_id, user_id }, GroupRoleSchema);
}

async function selectUserInCourseInstance({
  uid,
  courseInstance,
  authzData,
}: {
  uid: string;
  courseInstance: CourseInstance;
  authzData: AuthzData;
}) {
  const user = await selectOptionalUserByUid(uid);
  if (!user) return null;

  // To be part of a group, the user needs to either be enrolled in the course
  // instance, or be an instructor
  if (
    (await sqldb.callRow(
      'users_is_instructor_in_course_instance',
      [user.id, courseInstance.id],
      z.boolean(),
    )) ||
    (await selectOptionalEnrollmentByUserId({
      courseInstance,
      userId: user.id,
      // The function can be called by the system, a student, or an instructor
      requiredRole: ['Student', 'Student Data Viewer', 'System'],
      authzData,
    }))
  ) {
    return user;
  }

  // In the example course, any user with instructor access in any other
  // course should have access and thus be allowed to be added to a group.
  const course = await selectCourseById(courseInstance.course_id);
  if (course.example_course && (await userIsInstructorInAnyCourse({ user_id: user.id }))) {
    return user;
  }

  // We do not distinguish between an invalid user and a user that is not in the course instance
  return null;
}

export async function addUserToGroup({
  course_instance,
  assessment,
  group_id,
  uid,
  authn_user_id,
  enforceGroupSize,
  authzData,
}: {
  course_instance: CourseInstance;
  assessment: Assessment;
  group_id: string;
  uid: string;
  authn_user_id: string;
  enforceGroupSize: boolean;
  authzData: AuthzData;
}) {
  await sqldb.runInTransactionAsync(async () => {
    const group = await sqldb.queryOptionalRow(
      sql.select_and_lock_group,
      { group_id, assessment_id: assessment.id },
      GroupForUpdateSchema,
    );
    if (group == null) {
      throw new GroupOperationError('Group does not exist.');
    }

    const user = await selectUserInCourseInstance({
      uid,
      courseInstance: course_instance,
      authzData,
    });
    if (!user) {
      throw new GroupOperationError(`User ${uid} is not enrolled in this course.`);
    }

    // This is technically susceptible to race conditions. That won't be an
    // issue once we have a unique constraint for group membership.
    const existingGroupId = await getGroupId(assessment.id, user.id);
    if (existingGroupId != null) {
      // Otherwise, the user is in a different group, which is an error
      if (idsEqual(user.id, authn_user_id)) {
        throw new GroupOperationError('You are already in another group.');
      } else {
        throw new GroupOperationError('User is already in another group.');
      }
    }

    if (enforceGroupSize && group.max_size != null && group.cur_size >= group.max_size) {
      throw new GroupOperationError('Group is already full.');
    }

    // Find a group role. If none of the roles can be assigned, assign no role.
    const groupRoleId = group.has_roles
      ? await sqldb.queryOptionalRow(
          sql.select_suitable_group_role,
          { assessment_id: assessment.id, group_id: group.id, cur_size: group.cur_size },
          IdSchema,
        )
      : null;

    await sqldb.execute(sql.insert_group_user, {
      group_id: group.id,
      user_id: user.id,
      group_config_id: group.team_config_id,
      assessment_id: assessment.id,
      authn_user_id,
      group_role_id: groupRoleId,
    });
  });
}

export async function joinGroup({
  course_instance,
  assessment,
  fullJoinCode,
  uid,
  authn_user_id,
  authzData,
}: {
  course_instance: CourseInstance;
  assessment: Assessment;
  fullJoinCode: string;
  uid: string;
  authn_user_id: string;
  authzData: AuthzData;
}): Promise<void> {
  const splitJoinCode = fullJoinCode.split('-');
  if (splitJoinCode.length !== 2 || splitJoinCode[1].length !== 4) {
    // the join code input by user is not valid (not in format of groupname+4-character)
    throw new GroupOperationError('The join code has an incorrect format');
  }

  const group_name = splitJoinCode[0];
  const join_code = splitJoinCode[1].toUpperCase();

  try {
    await sqldb.runInTransactionAsync(async () => {
      const group = await sqldb.queryOptionalRow(
        sql.select_and_lock_group_by_name,
        { group_name, assessment_id: assessment.id },
        GroupSchema,
      );
      if (group?.join_code !== join_code) {
        throw new GroupOperationError('Group does not exist.');
      }
      await addUserToGroup({
        course_instance,
        assessment,
        group_id: group.id,
        uid,
        authn_user_id,
        enforceGroupSize: true,
        authzData,
      });
    });
  } catch (err) {
    if (err instanceof GroupOperationError) {
      throw new GroupOperationError(`Cannot join group "${fullJoinCode}": ${err.message}`);
    }
    throw err;
  }
}

export async function createGroup({
  course_instance,
  assessment,
  group_name,
  uids,
  authn_user_id,
  authzData,
}: {
  course_instance: CourseInstance;
  assessment: Assessment;
  group_name: string | null;
  uids: string[];
  authn_user_id: string;
  authzData: AuthzData;
}): Promise<Group> {
  if (group_name) {
    if (group_name.length > 30) {
      throw new GroupOperationError(
        'The group name is too long. Use at most 30 alphanumerical characters.',
      );
    }
    if (!/^[0-9a-zA-Z]+$/.test(group_name)) {
      throw new GroupOperationError(
        'The group name is invalid. Only alphanumerical characters (letters and digits) are allowed.',
      );
    }
    if (/^group[0-9]{7,}$/.test(group_name)) {
      // This test is used to simplify the logic behind system-generated group
      // names. These are created automatically by adding one to the latest
      // group name with a number. Allowing a user to specify a group name with
      // this format could cause an issue if the number is too long, as it would
      // cause integer overflows in the group calculation. While changing the
      // process to generate group names that don't take these numbers into
      // account is possible, this validation is simpler.
      throw new GroupOperationError(
        'User-specified group names cannot start with "group" followed by a large number.',
      );
    }
  }

  if (uids.length === 0) {
    throw new GroupOperationError('There must be at least one user in the group.');
  }

  try {
    return await sqldb.runInTransactionAsync(async () => {
      const group = await sqldb
        .queryRow(
          sql.create_group,
          { assessment_id: assessment.id, authn_user_id, group_name },
          GroupSchema,
        )
        .catch((err) => {
          // 23505 is the Postgres error code for unique constraint violation
          // (https://www.postgresql.org/docs/current/errcodes-appendix.html)
          if (err.code === '23505' && err.constraint === 'unique_team_name') {
            throw new GroupOperationError('Group name is already taken.');
          }
          // Any other error is unexpected and should be handled by the main processes
          throw err;
        });

      for (const uid of uids) {
        await addUserToGroup({
          course_instance,
          assessment,
          group_id: group.id,
          uid,
          authn_user_id,
          enforceGroupSize: false,
          authzData,
        });
      }
      return group;
    });
  } catch (err) {
    if (err instanceof GroupOperationError) {
      if (group_name) {
        throw new GroupOperationError(`Failed to create the group ${group_name}. ${err.message}`);
      } else {
        throw new GroupOperationError(
          `Failed to create a group for: ${uids.join(', ')}. ${err.message}`,
        );
      }
    }
    throw err;
  }
}

export async function createOrAddToGroup({
  course_instance,
  assessment,
  group_name,
  uids,
  authn_user_id,
  authzData,
}: {
  course_instance: CourseInstance;
  assessment: Assessment;
  group_name: string;
  uids: string[];
  authn_user_id: string;
  authzData: AuthzData;
}): Promise<Group> {
  return await sqldb.runInTransactionAsync(async () => {
    const existingGroup = await sqldb.queryOptionalRow(
      sql.select_and_lock_group_by_name,
      { group_name, assessment_id: assessment.id },
      GroupSchema,
    );
    if (existingGroup == null) {
      return await createGroup({
        course_instance,
        assessment,
        group_name,
        uids,
        authn_user_id,
        authzData,
      });
    } else {
      for (const uid of uids) {
        await addUserToGroup({
          course_instance,
          assessment,
          group_id: existingGroup.id,
          uid,
          authn_user_id,
          enforceGroupSize: false,
          authzData,
        });
      }
      return existingGroup;
    }
  });
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

export async function leaveGroup(
  assessmentId: string,
  userId: string,
  authnUserId: string,
  checkGroupId: string | null = null,
): Promise<void> {
  await sqldb.runInTransactionAsync(async () => {
    const groupId = await getGroupId(assessmentId, userId);
    if (groupId === null) {
      throw new error.HttpStatusError(404, 'User is not part of a group in this assessment');
    }
    if (checkGroupId != null && !idsEqual(groupId, checkGroupId)) {
      throw new error.HttpStatusError(
        403,
        'Group ID does not match the user ID and assessment ID provided',
      );
    }

    const groupConfig = await getGroupConfig(assessmentId);

    if (groupConfig.has_roles) {
      const groupInfo = await getGroupInfo(groupId, groupConfig);

      // Reassign roles if there is more than 1 user
      const currentSize = groupInfo.groupMembers.length;
      if (currentSize > 1) {
        const groupRoleAssignmentUpdates = getGroupRoleReassignmentsAfterLeave(groupInfo, userId);
        await sqldb.execute(sql.update_group_roles, {
          role_assignments: JSON.stringify(groupRoleAssignmentUpdates),
          group_id: groupId,
          authn_user_id: authnUserId,
        });

        // teams with low enough size should only use required roles
        const minRolesToFill = sum(
          groupInfo.rolesInfo?.groupRoles.map((role) => role.minimum ?? 0) ?? [],
        );
        if (currentSize - 1 <= minRolesToFill) {
          await sqldb.execute(sql.delete_non_required_roles, {
            group_id: groupId,
            assessment_id: assessmentId,
          });
        }
      }
    }

    // Delete user from group and log
    await sqldb.execute(sql.delete_group_users, {
      assessment_id: assessmentId,
      group_id: groupId,
      user_id: userId,
      authn_user_id: authnUserId,
    });
  });
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

/**
 * Updates the role assignments of users in a group, given the output from the GroupRoleTable component.
 */
export async function updateGroupRoles(
  requestBody: Record<string, any>,
  assessmentId: string,
  groupId: string,
  userId: string,
  hasStaffPermission: boolean,
  authnUserId: string,
) {
  await sqldb.runInTransactionAsync(async () => {
    const groupConfig = await getGroupConfig(assessmentId);
    const groupInfo = await getGroupInfo(groupId, groupConfig);

    if (!hasStaffPermission && !canUserAssignGroupRoles(groupInfo, userId)) {
      throw new error.HttpStatusError(403, 'User does not have permission to assign roles');
    }

    // Convert form data to valid input format for a SQL function
    const roleKeys = Object.keys(requestBody).filter((key) => key.startsWith('user_role_'));
    const roleAssignments = roleKeys.map((roleKey) => {
      const [roleId, userId] = roleKey.replace('user_role_', '').split('-');
      if (!groupInfo.groupMembers.some((member) => idsEqual(member.id, userId))) {
        throw new error.HttpStatusError(403, `User ${userId} is not a member of this group`);
      }
      if (!groupInfo.rolesInfo?.groupRoles.some((role) => idsEqual(role.id, roleId))) {
        throw new error.HttpStatusError(403, `Role ${roleId} does not exist for this assessment`);
      }
      return {
        user_id: userId,
        team_role_id: roleId,
      };
    });

    // If no one is being given a role with assigner permissions, give that role to the current user
    const assignerRoleIds =
      groupInfo.rolesInfo?.groupRoles
        .filter((role) => role.can_assign_roles)
        .map((role) => role.id) ?? [];
    const assignerRoleFound = roleAssignments.some((roleAssignment) =>
      assignerRoleIds.includes(roleAssignment.team_role_id),
    );
    if (!assignerRoleFound) {
      if (!groupInfo.groupMembers.some((member) => idsEqual(member.id, userId))) {
        // If the current user is not in the group, this usually means they are a staff member, so give the assigner role to the first user
        userId = groupInfo.groupMembers[0].id;
      }
      roleAssignments.push({
        user_id: userId,
        team_role_id: assignerRoleIds[0], // JSON key name for SQL
      });
    }

    await sqldb.execute(sql.update_group_roles, {
      group_id: groupId,
      role_assignments: JSON.stringify(roleAssignments),
      authn_user_id: authnUserId,
    });
  });
}

export async function deleteGroup(assessment_id: string, group_id: string, authn_user_id: string) {
  const deleted_group_id = await sqldb.queryOptionalRow(
    sql.delete_group,
    { assessment_id, group_id, authn_user_id },
    IdSchema,
  );
  if (deleted_group_id == null) {
    throw new error.HttpStatusError(404, 'Group does not exist.');
  }
}

/**
 * Delete all groups for the given assessment.
 */
export async function deleteAllGroups(assessmentId: string, authnUserId: string) {
  await sqldb.execute(sql.delete_all_groups, {
    assessment_id: assessmentId,
    authn_user_id: authnUserId,
  });
}

export function getRoleNamesForUser(groupInfo: GroupInfo, user: User): string[] {
  return groupInfo.rolesInfo?.roleAssignments[user.uid]?.map((r) => r.role_name) ?? ['None'];
}
