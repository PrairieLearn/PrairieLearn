//@ts-check
const error = require('@prairielearn/error');
const { flash } = require('@prairielearn/flash');
const { z } = require('zod');
const _ = require('lodash');

const sqldb = require('@prairielearn/postgres');
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

const GroupIdSchema = z.string();

const GroupMemberSchema = z.object({
  uid: z.string(),
  user_id: z.string(),
  group_name: z.string(),
  join_code: z.string(),
});

const RoleAssignmentSchema = z.object({
  user_id: z.string(),
  uid: z.string(),
  role_name: z.string(),
  group_role_id: z.string(),
});

const GroupRoleSchema = z.object({
  id: z.string(),
  role_name: z.string(),
  count: z.coerce.number(),
  maximum: z.number().nullable(),
  minimum: z.number().nullable(),
  can_assign_roles_at_start: z.boolean(),
  can_assign_roles_during_assessment: z.boolean(),
});

const AssessmentLevelPermissionsSchema = z.object({
  can_assign_roles_at_start: z.boolean().nullable(),
  can_assign_roles_during_assessment: z.boolean().nullable(),
});

/** @typedef {z.infer<GroupConfigSchema>} GroupConfig */
/** @typedef {z.infer<GroupMemberSchema>} GroupMember */
/** @typedef {z.infer<GroupRoleSchema>} GroupRole */
/** @typedef {z.infer<AssessmentLevelPermissionsSchema>} AssessmentLevelPermissions */

/**
 * @typedef {Object} RolesInfo
 * @property {Object} roleAssignments
 * @property {GroupRole[]} groupRoles
 * @property {GroupRole[]} validationErrors
 * @property {string[]} disabledRoles
 * @property {boolean} rolesAreBalanced
 * @property {GroupMember[]} usersWithoutRoles
 */

/**
 * @typedef {Object} GroupInfo
 * @property {GroupMember[]} groupMembers
 * @property {number} groupSize
 * @property {string} groupName
 * @property {string} joinCode
 * @property {boolean} start
 * @property {RolesInfo} rolesInfo
 */

/**
 * @typedef {Object} GroupRoleAssignment
 * @property {string} group_role_id
 * @property {string} user_id
 */

/**
 * Gets the group config info for a given assessment id.
 *
 * @param {string} assessmentId
 * @returns {Promise<GroupConfig>}
 */
module.exports.getGroupConfig = async function (assessmentId) {
  let params = { assessment_id: assessmentId };
  return await sqldb.queryValidatedOneRow(sql.get_group_config, params, GroupConfigSchema);
};

/**
 * Returns the group id for the user's current group in an assessment, if it exists.
 * Used in checking whether the user is in a group or not.
 *
 * @param {string} assessmentId
 * @param {string} userId
 * @returns {Promise<string | null>}
 */
module.exports.getGroupId = async function (assessmentId, userId) {
  let params = { assessment_id: assessmentId, user_id: userId };
  return await sqldb.queryValidatedSingleColumnZeroOrOneRow(
    sql.get_group_id,
    params,
    GroupIdSchema,
  );
};

/**
 * @param {string} groupId
 * @param {GroupConfig} groupConfig
 * @returns {Promise<GroupInfo>}
 */
module.exports.getGroupInfo = async function (groupId, groupConfig) {
  const groupInfo = {};

  let params = { group_id: groupId };
  let result = await sqldb.queryValidatedRows(sql.get_group_members, params, GroupMemberSchema);
  groupInfo.groupMembers = result;
  groupInfo.groupSize = result.length;
  groupInfo.groupName = result[0].group_name;
  groupInfo.joinCode = groupInfo.groupName + '-' + groupInfo.groupMembers[0].join_code;
  const needSize = (groupConfig.minimum ?? 0) - groupInfo.groupSize;

  if (groupConfig.has_roles) {
    const rolesInfo = await getRolesInfo(groupId, groupInfo.groupMembers);
    groupInfo.start =
      needSize <= 0 &&
      rolesInfo.rolesAreBalanced &&
      rolesInfo.validationErrors.length === 0 &&
      rolesInfo.usersWithoutRoles.length === 0;
    groupInfo.rolesInfo = rolesInfo;
  } else {
    groupInfo.start = needSize <= 0;
  }

  return groupInfo;
};

/**
 * A helper function to getGroupInfo that returns a data structure containing info about an
 * assessment's group roles.
 *
 * @param {string} groupId
 * @param {GroupMember[]} groupMembers
 * @returns {Promise<RolesInfo>}
 */
async function getRolesInfo(groupId, groupMembers) {
  const rolesInfo = {};

  // Get the current role assignments of the group
  let params = { group_id: groupId };
  let result = await sqldb.queryValidatedRows(
    sql.get_role_assignments,
    params,
    RoleAssignmentSchema,
  );
  let roleAssignments = {}; // {uid: [{role_name, group_role_id, user_id}]}
  result.forEach(({ uid, role_name, group_role_id, user_id }) => {
    if (uid in roleAssignments) {
      roleAssignments[uid].push({ role_name, group_role_id, user_id });
    } else {
      roleAssignments[uid] = [{ role_name, group_role_id, user_id }];
    }
  });
  rolesInfo.roleAssignments = roleAssignments;

  // Get info on all group roles for the assessment
  params = { group_id: groupId };
  rolesInfo.groupRoles = await sqldb.queryValidatedRows(
    sql.get_group_roles,
    params,
    GroupRoleSchema,
  );

  // Identify errors for any roles where count is not between max and min (if they exist)
  rolesInfo.validationErrors = rolesInfo.groupRoles.filter(
    (role) =>
      (role.minimum && role.count < role.minimum) || (role.maximum && role.count > role.maximum),
  );

  // Identify any disabled roles based on group size, role minimums
  let minimumRolesToFill = 0;
  let optionalRoleNames = [];
  rolesInfo.groupRoles.forEach((role) => {
    if ((role.minimum ?? 0) === 0) {
      optionalRoleNames.push(role.role_name);
    }
    minimumRolesToFill += role.minimum ?? 0;
  });
  let groupSize = groupMembers.length;
  rolesInfo.disabledRoles = groupSize <= minimumRolesToFill ? optionalRoleNames : [];

  // Check if any users have too many roles
  if (groupSize >= minimumRolesToFill) {
    rolesInfo.rolesAreBalanced = Object.values(roleAssignments).every(
      (roles) => roles.length === 1,
    );
  } else {
    rolesInfo.rolesAreBalanced = true;
  }

  // Check if users have no roles
  rolesInfo.usersWithoutRoles = groupMembers.filter(
    (member) => roleAssignments[member.uid] === undefined,
  );

  return rolesInfo;
}

/**
 * @param {string} fullJoinCode
 * @param {string} assessmentId
 * @param {string} userId
 * @param {string} authnUserId
 */
module.exports.joinGroup = async function (fullJoinCode, assessmentId, userId, authnUserId) {
  var splitJoinCode = fullJoinCode.split('-');
  if (splitJoinCode.length !== 2 || splitJoinCode[1].length !== 4) {
    // the join code input by user is not valid (not in format of groupname+4-character)
    flash('error', 'The join code has an incorrect format');
    return;
  }
  const groupName = splitJoinCode[0];
  const joinCode = splitJoinCode[1].toUpperCase();
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
};

/**
 * @param {string} groupName
 * @param {string} assessmentId
 * @param {string} userId
 * @param {string} authnUserId
 */
module.exports.createGroup = async function (groupName, assessmentId, userId, authnUserId) {
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
};

/**
 * @param {GroupInfo} groupInfo
 * @param {string} leavingUserId
 * @returns {GroupRoleAssignment[]}
 */
module.exports.getGroupRoleReassignmentsAfterLeave = function (groupInfo, leavingUserId) {
  // Get the roleIds of the leaving user that need to be re-assigned to other users
  const groupRoleAssignments = Object.values(groupInfo.rolesInfo.roleAssignments).flat();

  const leavingUserRoleIds = groupRoleAssignments
    .filter(({ user_id }) => user_id === leavingUserId.toString())
    .map(({ group_role_id }) => group_role_id);

  const roleIdsToReassign = groupInfo.rolesInfo.groupRoles
    .filter(
      (role) =>
        (role.minimum ?? 0) > 0 &&
        role.count <= (role.minimum ?? 0) &&
        leavingUserRoleIds.includes(role.id),
    )
    .map((role) => role.id);

  // Get group user to group role assignments, excluding the leaving user
  const groupRoleAssignmentUpdates = groupRoleAssignments
    .filter(({ user_id }) => user_id !== leavingUserId.toString())
    .map(({ user_id, group_role_id }) => ({ user_id, group_role_id }));

  for (const roleId of roleIdsToReassign) {
    // First, try to give the role to a user with no roles
    const userIdWithNoRoles = groupInfo.groupMembers.find(
      (m) =>
        m.user_id !== leavingUserId.toString() &&
        groupRoleAssignmentUpdates.find(({ user_id }) => user_id === m.user_id) === undefined,
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
        groupInfo.rolesInfo.groupRoles.find((role) => role.id === group_role_id)?.minimum ?? 0;
      return roleMin === 0;
    });
    if (idxToUpdate !== -1) {
      groupRoleAssignmentUpdates[idxToUpdate].group_role_id = roleId;
      continue;
    }

    // Finally, try to give the role to a user that doesn't already have it
    const assigneeUserId = groupInfo.groupMembers.find(
      (m) =>
        m.user_id !== leavingUserId.toString() &&
        !groupRoleAssignmentUpdates.some(
          (u) => u.group_role_id === roleId && u.user_id === m.user_id,
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
};

/**
 * @param {string} assessmentId
 * @param {string} userId
 * @param {string} authnUserId
 */
module.exports.leaveGroup = async function (assessmentId, userId, authnUserId) {
  await sqldb.runInTransactionAsync(async () => {
    const groupId = await module.exports.getGroupId(assessmentId, userId);
    if (groupId === null) {
      throw new Error(
        "Couldn't access the user's group ID with the provided assessment and user IDs",
      );
    }
    const groupConfig = await module.exports.getGroupConfig(assessmentId);

    if (groupConfig.has_roles) {
      const groupInfo = await module.exports.getGroupInfo(groupId, groupConfig);

      // Reassign roles if there is more than 1 user
      const currentSize = groupInfo.groupMembers.length;
      if (currentSize > 1) {
        const groupRoleAssignmentUpdates = module.exports.getGroupRoleReassignmentsAfterLeave(
          groupInfo,
          userId,
        );

        await sqldb.queryAsync(sql.reassign_group_roles_after_leave, {
          assessment_id: assessmentId,
          role_assignments: JSON.stringify(groupRoleAssignmentUpdates),
          group_id: groupId,
        });

        // Groups with low enough size should only use required roles
        const minRolesToFill = _.sum(
          groupInfo.rolesInfo.groupRoles.map((role) => role.minimum ?? 0),
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
};

/**
 * @param {string} assessmentId
 * @param {string} userId
 * @returns {Promise<AssessmentLevelPermissions>}
 */
module.exports.getAssessmentPermissions = async function (assessmentId, userId) {
  const params = { assessment_id: assessmentId, user_id: userId };
  return await sqldb.queryValidatedOneRow(
    sql.get_assessment_level_permissions,
    params,
    AssessmentLevelPermissionsSchema,
  );
};

/**
 * Updates the role assignments of users in a group, given the output from groupRoleSelectTable.ejs.
 *
 * @param {Object} requestBody
 * @param {string} assessmentId
 * @param {string} userId
 * @param {string} authnUserId
 */
module.exports.updateGroupRoles = async function (requestBody, assessmentId, userId, authnUserId) {
  await sqldb.runInTransactionAsync(async () => {
    const groupId = await module.exports.getGroupId(assessmentId, userId);
    if (groupId === null) {
      throw new Error(
        "Couldn't access the user's group ID with the provided assessment and user IDs",
      );
    }

    const permissions = await module.exports.getAssessmentPermissions(assessmentId, userId);
    if (!permissions.can_assign_roles_at_start) {
      throw error.make(
        403,
        'User does not have permission to assign roles at the start of this assessment',
      );
    }

    const groupConfig = await module.exports.getGroupConfig(assessmentId);
    const groupInfo = await module.exports.getGroupInfo(groupId, groupConfig);

    // Convert form data to valid input format for a SQL function
    const roleKeys = Object.keys(requestBody).filter((key) => key.startsWith('user_role_'));
    let roleAssignments = [];
    for (const roleKey of roleKeys) {
      const [roleId, userId] = roleKey.replace('user_role_', '').split('-');
      roleAssignments.push({
        group_id: groupId,
        user_id: userId,
        group_role_id: roleId,
      });
    }

    // If no one is being given a role with assigner permissions, give that role to the current user
    const assignerRoleIds = groupInfo.rolesInfo.groupRoles
      .filter((role) => role.can_assign_roles_at_start)
      .map((role) => role.id);
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
};

/**
 * Delete all groups for the given assessment.
 *
 * @param {string} assessmentId
 * @param {string} authnUserId
 */
module.exports.deleteAllGroups = async function (assessmentId, authnUserId) {
  await sqldb.queryAsync(sql.delete_all_groups, {
    assessment_id: assessmentId,
    authn_user_id: authnUserId,
  });
};
