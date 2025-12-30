import _ from 'lodash';
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
  type Team,
  type TeamConfig,
  TeamConfigSchema,
  TeamRoleSchema,
  TeamSchema,
  type TeamUserRole,
  type User,
  UserSchema,
} from './db-types.js';
import { idsEqual } from './id.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export class TeamOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TeamOperationError';
  }
}

const RoleAssignmentSchema = z.object({
  user_id: z.string(),
  uid: z.string(),
  role_name: z.string(),
  team_role_id: z.string(),
});
export type RoleAssignment = z.infer<typeof RoleAssignmentSchema>;

const TeamRoleWithCountSchema = TeamRoleSchema.extend({
  count: z.number(),
});
export type TeamRoleWithCount = z.infer<typeof TeamRoleWithCountSchema>;

interface RolesInfo {
  roleAssignments: Record<string, RoleAssignment[]>;
  teamRoles: TeamRoleWithCount[];
  validationErrors: TeamRoleWithCount[];
  disabledRoles: string[];
  rolesAreBalanced: boolean;
  usersWithoutRoles: User[];
}

export interface TeamInfo {
  teamMembers: User[];
  teamSize: number;
  teamName: string;
  joinCode: string;
  start: boolean;
  rolesInfo?: RolesInfo;
}

type TeamRoleAssignment = Pick<TeamUserRole, 'team_role_id' | 'user_id'>;

const TeamForUpdateSchema = TeamSchema.extend({
  cur_size: z.number(),
  max_size: z.number().nullable(),
  has_roles: z.boolean(),
});

/**
 * Gets the group config info for a given assessment id.
 */
export async function getTeamConfig(assessmentId: string): Promise<TeamConfig> {
  return await sqldb.queryRow(
    sql.get_team_config,
    { assessment_id: assessmentId },
    TeamConfigSchema,
  );
}

/**
 * Returns the group id for the user's current group in an assessment, if it exists.
 * Used in checking whether the user is in a group or not.
 */
export async function getTeamId(assessmentId: string, userId: string): Promise<string | null> {
  return await sqldb.queryOptionalRow(
    sql.get_team_id,
    { assessment_id: assessmentId, user_id: userId },
    IdSchema,
  );
}

export async function getTeamInfo(team_id: string, teamConfig: TeamConfig): Promise<TeamInfo> {
  const team = await sqldb.queryRow(sql.select_team, { team_id }, TeamSchema);
  const teamMembers = await sqldb.queryRows(sql.select_team_members, { team_id }, UserSchema);

  const needSize = (teamConfig.minimum ?? 0) - teamMembers.length;
  const teamInfo: TeamInfo = {
    teamMembers,
    teamSize: teamMembers.length,
    teamName: team.name,
    joinCode: team.name + '-' + team.join_code,
    start: needSize <= 0,
  };

  if (teamConfig.has_roles) {
    const rolesInfo = await getRolesInfo(team_id, teamInfo.teamMembers);
    teamInfo.start =
      teamInfo.start &&
      rolesInfo.rolesAreBalanced &&
      rolesInfo.validationErrors.length === 0 &&
      rolesInfo.usersWithoutRoles.length === 0;
    teamInfo.rolesInfo = rolesInfo;
  }

  return teamInfo;
}

/**
 * A helper function to getTeamInfo that returns a data structure containing info about an
 * assessment's group roles.
 */
async function getRolesInfo(teamId: string, teamMembers: User[]): Promise<RolesInfo> {
  // Get the current role assignments of the team
  const result = await sqldb.queryRows(
    sql.get_role_assignments,
    { team_id: teamId },
    RoleAssignmentSchema,
  );
  const roleAssignments = _.groupBy(result, 'uid');

  // Get info on all team roles for the assessment
  const teamRoles = await sqldb.queryRows(
    sql.get_team_roles,
    { team_id: teamId },
    TeamRoleWithCountSchema,
  );

  // Identify errors for any roles where count is not between max and min (if they exist)
  const validationErrors = teamRoles.filter(
    (role) =>
      (role.minimum && role.count < role.minimum) || (role.maximum && role.count > role.maximum),
  );

  // Identify any disabled roles based on team size, role minimums
  const minimumRolesToFill = _.sum(teamRoles.map((role) => role.minimum ?? 0));
  const optionalRoleNames = teamRoles
    .filter((role) => (role.minimum ?? 0) === 0)
    .map((role) => role.role_name);
  const disabledRoles = teamMembers.length <= minimumRolesToFill ? optionalRoleNames : [];

  // Check if any users have too many roles
  const rolesAreBalanced =
    teamMembers.length < minimumRolesToFill ||
    Object.values(roleAssignments).every((roles) => roles.length === 1);

  // Check if users have no roles
  const usersWithoutRoles = teamMembers.filter((member) => !(member.uid in roleAssignments));

  return {
    roleAssignments,
    teamRoles,
    validationErrors,
    disabledRoles,
    rolesAreBalanced,
    usersWithoutRoles,
  };
}

const QuestionTeamPermissionsSchema = z.object({
  can_submit: z.boolean(),
  can_view: z.boolean(),
});
export type QuestionTeamPermissions = z.infer<typeof QuestionTeamPermissionsSchema>;

/**
 * This function assumes that the team has roles, so any caller must ensure
 * that it is only called in that scenario
 */
export async function getQuestionTeamPermissions(
  instance_question_id: string,
  team_id: string,
  user_id: string,
): Promise<QuestionTeamPermissions> {
  const userPermissions = await sqldb.queryOptionalRow(
    sql.select_question_permissions,
    { instance_question_id, team_id, user_id },
    QuestionTeamPermissionsSchema,
  );
  return userPermissions ?? { can_submit: false, can_view: false };
}

export async function getUserRoles(team_id: string, user_id: string) {
  return await sqldb.queryRows(sql.select_user_roles, { team_id, user_id }, TeamRoleSchema);
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

  // To be part of a team, the user needs to either be enrolled in the course
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
  // course should have access and thus be allowed to be added to a team.
  const course = await selectCourseById(courseInstance.course_id);
  if (course.example_course && (await userIsInstructorInAnyCourse({ user_id: user.id }))) {
    return user;
  }

  // We do not distinguish between an invalid user and a user that is not in the course instance
  return null;
}

export async function addUserToTeam({
  course_instance,
  assessment,
  team_id,
  uid,
  authn_user_id,
  enforceTeamSize,
  authzData,
}: {
  course_instance: CourseInstance;
  assessment: Assessment;
  team_id: string;
  uid: string;
  authn_user_id: string;
  enforceTeamSize: boolean;
  authzData: AuthzData;
}) {
  await sqldb.runInTransactionAsync(async () => {
    const team = await sqldb.queryOptionalRow(
      sql.select_and_lock_team,
      { team_id, assessment_id: assessment.id },
      TeamForUpdateSchema,
    );
    if (team == null) {
      throw new TeamOperationError('team does not exist.');
    }

    const user = await selectUserInCourseInstance({
      uid,
      courseInstance: course_instance,
      authzData,
    });
    if (!user) {
      throw new TeamOperationError(`User ${uid} is not enrolled in this course.`);
    }

    // This is technically susceptible to race conditions. That won't be an
    // issue once we have a unique constraint for team membership.
    const existingTeamId = await getTeamId(assessment.id, user.id);
    if (existingTeamId != null) {
      // Otherwise, the user is in a different team, which is an error
      if (idsEqual(user.id, authn_user_id)) {
        throw new TeamOperationError('You are already in another group.');
      } else {
        throw new TeamOperationError('User is already in another group.');
      }
    }

    if (enforceTeamSize && team.max_size != null && team.cur_size >= team.max_size) {
      throw new TeamOperationError('Group is already full.');
    }

    // Find a team role. If none of the roles can be assigned, assign no role.
    const teamRoleId = team.has_roles
      ? await sqldb.queryOptionalRow(
          sql.select_suitable_team_role,
          { assessment_id: assessment.id, team_id: team.id, cur_size: team.cur_size },
          IdSchema,
        )
      : null;

    await sqldb.execute(sql.insert_team_user, {
      team_id: team.id,
      user_id: user.id,
      team_config_id: team.team_config_id,
      assessment_id: assessment.id,
      authn_user_id,
      team_role_id: teamRoleId,
    });
  });
}

export async function joinTeam({
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
    // the join code input by user is not valid (not in format of teamname+4-character)
    throw new TeamOperationError('The join code has an incorrect format');
  }

  const team_name = splitJoinCode[0];
  const join_code = splitJoinCode[1].toUpperCase();

  try {
    await sqldb.runInTransactionAsync(async () => {
      const team = await sqldb.queryOptionalRow(
        sql.select_and_lock_team_by_name,
        { team_name, assessment_id: assessment.id },
        TeamSchema,
      );
      if (team?.join_code !== join_code) {
        throw new TeamOperationError('Group does not exist.');
      }
      await addUserToTeam({
        course_instance,
        assessment,
        team_id: team.id,
        uid,
        authn_user_id,
        enforceTeamSize: true,
        authzData,
      });
    });
  } catch (err) {
    if (err instanceof TeamOperationError) {
      throw new TeamOperationError(`Cannot join group "${fullJoinCode}": ${err.message}`);
    }
    throw err;
  }
}

export async function createTeam({
  course_instance,
  assessment,
  team_name,
  uids,
  authn_user_id,
  authzData,
}: {
  course_instance: CourseInstance;
  assessment: Assessment;
  team_name: string | null;
  uids: string[];
  authn_user_id: string;
  authzData: AuthzData;
}): Promise<Team> {
  if (team_name) {
    if (team_name.length > 30) {
      throw new TeamOperationError(
        'The group name is too long. Use at most 30 alphanumerical characters.',
      );
    }
    if (!/^[0-9a-zA-Z]+$/.test(team_name)) {
      throw new TeamOperationError(
        'The group name is invalid. Only alphanumerical characters (letters and digits) are allowed.',
      );
    }
    if (/^group[0-9]{7,}$/.test(team_name)) {
      // This test is used to simplify the logic behind system-generated team
      // names. These are created automatically by adding one to the latest
      // team name with a number. Allowing a user to specify a team name with
      // this format could cause an issue if the number is too long, as it would
      // cause integer overflows in the team calculation. While changing the
      // process to generate team names that don't take these numbers into
      // account is possible, this validation is simpler.
      throw new TeamOperationError(
        'User-specified group names cannot start with "group" followed by a large number.',
      );
    }
  }

  if (uids.length === 0) {
    throw new TeamOperationError('There must be at least one user in the group.');
  }

  try {
    return await sqldb.runInTransactionAsync(async () => {
      const team = await sqldb
        .queryRow(
          sql.create_team,
          { assessment_id: assessment.id, authn_user_id, team_name },
          TeamSchema,
        )
        .catch((err) => {
          // 23505 is the Postgres error code for unique constraint violation
          // (https://www.postgresql.org/docs/current/errcodes-appendix.html)
          if (err.code === '23505' && err.constraint === 'unique_team_name') {
            throw new TeamOperationError('Group name is already taken.');
          }
          // Any other error is unexpected and should be handled by the main processes
          throw err;
        });

      for (const uid of uids) {
        await addUserToTeam({
          course_instance,
          assessment,
          team_id: team.id,
          uid,
          authn_user_id,
          enforceTeamSize: false,
          authzData,
        });
      }
      return team;
    });
  } catch (err) {
    if (err instanceof TeamOperationError) {
      if (team_name) {
        throw new TeamOperationError(`Failed to create the group ${team_name}. ${err.message}`);
      } else {
        throw new TeamOperationError(
          `Failed to create a group for: ${uids.join(', ')}. ${err.message}`,
        );
      }
    }
    throw err;
  }
}

export async function createOrAddToTeam({
  course_instance,
  assessment,
  team_name,
  uids,
  authn_user_id,
  authzData,
}: {
  course_instance: CourseInstance;
  assessment: Assessment;
  team_name: string;
  uids: string[];
  authn_user_id: string;
  authzData: AuthzData;
}): Promise<Team> {
  return await sqldb.runInTransactionAsync(async () => {
    const existingTeam = await sqldb.queryOptionalRow(
      sql.select_and_lock_team_by_name,
      { team_name, assessment_id: assessment.id },
      TeamSchema,
    );
    if (existingTeam == null) {
      return await createTeam({
        course_instance,
        assessment,
        team_name,
        uids,
        authn_user_id,
        authzData,
      });
    } else {
      for (const uid of uids) {
        await addUserToTeam({
          course_instance,
          assessment,
          team_id: existingTeam.id,
          uid,
          authn_user_id,
          enforceTeamSize: false,
          authzData,
        });
      }
      return existingTeam;
    }
  });
}

export function getTeamRoleReassignmentsAfterLeave(
  teamInfo: TeamInfo,
  leavingUserId: string,
): TeamRoleAssignment[] {
  // Get the roleIds of the leaving user that need to be re-assigned to other users
  const teamRoleAssignments = Object.values(teamInfo.rolesInfo?.roleAssignments ?? {}).flat();

  const leavingUserRoleIds = new Set(
    teamRoleAssignments
      .filter(({ user_id }) => idsEqual(user_id, leavingUserId))
      .map(({ team_role_id }) => team_role_id),
  );

  const roleIdsToReassign =
    teamInfo.rolesInfo?.teamRoles
      .filter(
        (role) =>
          (role.minimum ?? 0) > 0 &&
          role.count <= (role.minimum ?? 0) &&
          leavingUserRoleIds.has(role.id),
      )
      .map((role) => role.id) ?? [];

  // Get team user to team role assignments, excluding the leaving user
  const teamRoleAssignmentUpdates = teamRoleAssignments
    .filter(({ user_id }) => !idsEqual(user_id, leavingUserId))
    .map(({ user_id, team_role_id }) => ({ user_id, team_role_id }));

  for (const roleId of roleIdsToReassign) {
    // First, try to give the role to a user with no roles
    const userIdWithNoRoles = teamInfo.teamMembers.find(
      (m) =>
        !idsEqual(m.id, leavingUserId) &&
        !teamRoleAssignmentUpdates.some(({ user_id }) => idsEqual(user_id, m.id)),
    )?.id;
    if (userIdWithNoRoles !== undefined) {
      teamRoleAssignmentUpdates.push({
        user_id: userIdWithNoRoles,
        team_role_id: roleId,
      });
      continue;
    }

    // Next, try to find a user with a non-required role and replace that role
    const idxToUpdate = teamRoleAssignmentUpdates.findIndex(({ team_role_id }) => {
      const roleMin =
        teamInfo.rolesInfo?.teamRoles.find((role) => idsEqual(role.id, team_role_id))?.minimum ?? 0;
      return roleMin === 0;
    });
    if (idxToUpdate !== -1) {
      teamRoleAssignmentUpdates[idxToUpdate].team_role_id = roleId;
      continue;
    }

    // Finally, try to give the role to a user that doesn't already have it
    const assigneeUserId = teamInfo.teamMembers.find(
      (m) =>
        !idsEqual(m.id, leavingUserId) &&
        !teamRoleAssignmentUpdates.some(
          (u) => idsEqual(u.team_role_id, roleId) && idsEqual(u.user_id, m.id),
        ),
    )?.id;
    if (assigneeUserId !== undefined) {
      teamRoleAssignmentUpdates.push({
        user_id: assigneeUserId,
        team_role_id: roleId,
      });
      continue;
    }
  }

  return teamRoleAssignmentUpdates;
}

export async function leaveTeam(
  assessmentId: string,
  userId: string,
  authnUserId: string,
  checkTeamId: string | null = null,
): Promise<void> {
  await sqldb.runInTransactionAsync(async () => {
    const teamId = await getTeamId(assessmentId, userId);
    if (teamId === null) {
      throw new error.HttpStatusError(404, 'User is not part of a group in this assessment');
    }
    if (checkTeamId != null && !idsEqual(teamId, checkTeamId)) {
      throw new error.HttpStatusError(
        403,
        'Group ID does not match the user ID and assessment ID provided',
      );
    }

    const teamConfig = await getTeamConfig(assessmentId);

    if (teamConfig.has_roles) {
      const teamInfo = await getTeamInfo(teamId, teamConfig);

      // Reassign roles if there is more than 1 user
      const currentSize = teamInfo.teamMembers.length;
      if (currentSize > 1) {
        const teamRoleAssignmentUpdates = getTeamRoleReassignmentsAfterLeave(teamInfo, userId);
        await sqldb.execute(sql.update_team_roles, {
          role_assignments: JSON.stringify(teamRoleAssignmentUpdates),
          team_id: teamId,
          authn_user_id: authnUserId,
        });

        // teams with low enough size should only use required roles
        const minRolesToFill = _.sum(
          teamInfo.rolesInfo?.teamRoles.map((role) => role.minimum ?? 0),
        );
        if (currentSize - 1 <= minRolesToFill) {
          await sqldb.execute(sql.delete_non_required_roles, {
            team_id: teamId,
            assessment_id: assessmentId,
          });
        }
      }
    }

    // Delete user from team and log
    await sqldb.execute(sql.delete_team_users, {
      assessment_id: assessmentId,
      team_id: teamId,
      user_id: userId,
      authn_user_id: authnUserId,
    });
  });
}

export function canUserAssignTeamRoles(teamInfo: TeamInfo, user_id: string): boolean {
  const assignerRoles =
    teamInfo.rolesInfo?.teamRoles.filter((role) => role.can_assign_roles).map((role) => role.id) ??
    [];
  const assignerUsers = Object.values(teamInfo.rolesInfo?.roleAssignments ?? {})
    .flat()
    .filter((assignment) => assignerRoles.some((id) => idsEqual(id, assignment.team_role_id)))
    .map((assignment) => assignment.user_id);
  if (assignerUsers.length === 0) {
    // If none of the current users in the team has an assigner role, allow any
    // user to assign roles by default
    return true;
  } else {
    // Otherwise, check if current user is in the list of assigner users
    return assignerUsers.some((id) => idsEqual(id, user_id));
  }
}

/**
 * Updates the role assignments of users in a team, given the output from the TeamRoleTable component.
 */
export async function updateTeamRoles(
  requestBody: Record<string, any>,
  assessmentId: string,
  teamId: string,
  userId: string,
  hasStaffPermission: boolean,
  authnUserId: string,
) {
  await sqldb.runInTransactionAsync(async () => {
    const teamConfig = await getTeamConfig(assessmentId);
    const teamInfo = await getTeamInfo(teamId, teamConfig);

    if (!hasStaffPermission && !canUserAssignTeamRoles(teamInfo, userId)) {
      throw new error.HttpStatusError(403, 'User does not have permission to assign roles');
    }

    // Convert form data to valid input format for a SQL function
    const roleKeys = Object.keys(requestBody).filter((key) => key.startsWith('user_role_'));
    const roleAssignments = roleKeys.map((roleKey) => {
      const [roleId, userId] = roleKey.replace('user_role_', '').split('-');
      if (!teamInfo.teamMembers.some((member) => idsEqual(member.id, userId))) {
        throw new error.HttpStatusError(403, `User ${userId} is not a member of this group`);
      }
      if (!teamInfo.rolesInfo?.teamRoles.some((role) => idsEqual(role.id, roleId))) {
        throw new error.HttpStatusError(403, `Role ${roleId} does not exist for this assessment`);
      }
      return {
        user_id: userId,
        team_role_id: roleId,
      };
    });

    // If no one is being given a role with assigner permissions, give that role to the current user
    const assignerRoleIds =
      teamInfo.rolesInfo?.teamRoles
        .filter((role) => role.can_assign_roles)
        .map((role) => role.id) ?? [];
    const assignerRoleFound = roleAssignments.some((roleAssignment) =>
      assignerRoleIds.includes(roleAssignment.team_role_id),
    );
    if (!assignerRoleFound) {
      if (!teamInfo.teamMembers.some((member) => idsEqual(member.id, userId))) {
        // If the current user is not in the team, this usually means they are a staff member, so give the assigner role to the first user
        userId = teamInfo.teamMembers[0].id;
      }
      roleAssignments.push({
        user_id: userId,
        team_role_id: assignerRoleIds[0], // JSON key name for SQL
      });
    }

    await sqldb.execute(sql.update_team_roles, {
      team_id: teamId,
      role_assignments: JSON.stringify(roleAssignments),
      authn_user_id: authnUserId,
    });
  });
}

export async function deleteTeam(assessment_id: string, team_id: string, authn_user_id: string) {
  const deleted_team_id = await sqldb.queryOptionalRow(
    sql.delete_team,
    { assessment_id, team_id, authn_user_id },
    IdSchema,
  );
  if (deleted_team_id == null) {
    throw new error.HttpStatusError(404, 'Group does not exist.');
  }
}

/**
 * Delete all team for the given assessment.
 */
export async function deleteAllTeams(assessmentId: string, authnUserId: string) {
  await sqldb.execute(sql.delete_all_teams, {
    assessment_id: assessmentId,
    authn_user_id: authnUserId,
  });
}

export function getRoleNamesForUser(teamInfo: TeamInfo, user: User): string[] {
  return teamInfo.rolesInfo?.roleAssignments[user.uid]?.map((r) => r.role_name) ?? ['None'];
}
