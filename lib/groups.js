//@ts-check
const ERR = require('async-stacktrace');
const z = require('zod');

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
});

const GroupRoleSchema = z.object({
  id: z.string(),
  role_name: z.string(),
  count: z.coerce.number(),
  maximum: z.number().nullable(),
  minimum: z.number().nullable(),
});

const AssessmentLevelPermissionsSchema = z.object({
  can_assign_roles_at_start: z.boolean(),
  can_assign_roles_during_assessment: z.boolean(),
});

const GroupRoleIdSchema = z.string();

const UserToGroupRoleSchema = z.object({
  user_id: z.string(),
  group_role_id: z.string(),
});

/**
 * @typedef {Object} GroupConfig
 * @property {string} [assessment_id]
 * @property {string} [course_instance_id]
 * @property {Date} [date]
 * @property {Date} [deleted_at]
 * @property {boolean} [has_roles]
 * @property {string} [id]
 * @property {number} [maximum]
 * @property {number} [minimum]
 * @property {string} [name]
 * @property {boolean} [student_authz_create]
 * @property {boolean} [student_authz_join]
 * @property {boolean} [student_authz_leave]
 */

/**
 * @typedef {Object} GroupMember
 * @property {string} [uid]
 * @property {string} [user_id]
 * @property {string} [group_name]
 * @property {string} [join_code]
 */

/**
 * @typedef {Object} GroupRole
 * @property {string} [id]
 * @property {string} [role_name]
 * @property {number} [count]
 * @property {number} [maximum]
 * @property {number} [minimum]
 */

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
 * @typedef {Object} AssessmentLevelPermissions
 * @property {boolean} [can_assign_roles_at_start]
 * @property {boolean} [can_assign_roles_during_assessment]
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
 * @returns {Promise<string>}
 */
module.exports.getGroupId = async function (assessmentId, userId) {
  let params = { assessment_id: assessmentId, user_id: userId };
  let result = await sqldb.queryValidatedSingleColumnRows(sql.get_group_id, params, GroupIdSchema);
  if (result.length === 0) {
    return undefined;
  } else {
    return result[0];
  }
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
  const needSize = groupConfig.minimum - groupInfo.groupSize;

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
    RoleAssignmentSchema
  );
  let roleAssignments = {}; // {uid: [role_name]}
  result.forEach((row) => {
    if (row.uid in roleAssignments) {
      roleAssignments[row.uid].push(row.role_name);
    } else {
      roleAssignments[row.uid] = [row.role_name];
    }
  });
  rolesInfo.roleAssignments = roleAssignments;

  // Get info on all group roles for the assessment
  params = { group_id: groupId };
  rolesInfo.groupRoles = await sqldb.queryValidatedRows(
    sql.get_group_roles,
    params,
    GroupRoleSchema
  );

  // Identify errors for any roles where count is not between max and min (if they exist)
  rolesInfo.validationErrors = rolesInfo.groupRoles.filter(
    (role) =>
      (role.minimum && role.count < role.minimum) || (role.maximum && role.count > role.maximum)
  );

  // Identify any disabled roles based on group size, role min
  let requiredRoleNames = [];
  let optionalRoleNames = [];
  rolesInfo.groupRoles.forEach((role) => {
    if (role.minimum > 0) {
      requiredRoleNames.push(role.role_name);
    } else {
      optionalRoleNames.push(role.role_name);
    }
  });
  let groupSize = groupMembers.length;
  rolesInfo.disabledRoles = groupSize <= requiredRoleNames.length ? optionalRoleNames : [];

  // Check if any users has too many roles when the group size matches the # of required roles
  if (groupSize >= requiredRoleNames.length) {
    rolesInfo.rolesAreBalanced = Object.values(roleAssignments).every(
      (roles) => roles.length === 1
    );
  } else {
    rolesInfo.rolesAreBalanced = true;
  }

  // Check if users have no roles
  rolesInfo.usersWithoutRoles = groupMembers.filter(
    (member) => roleAssignments[member.uid] === undefined
  );

  return rolesInfo;
}

/**
 * @param {string} joinCode
 * @param {string} assessmentId
 * @param {string} userId
 * @param {string} authnUserId
 * @param {Function} callback
 */
module.exports.joinGroup = function (joinCode, assessmentId, userId, authnUserId, callback) {
  var splitJoinCode = joinCode.split('-');
  const validJoinCode = splitJoinCode.length === 2;
  if (validJoinCode) {
    const group_name = splitJoinCode[0];
    const join_code = splitJoinCode[1].toUpperCase();
    if (join_code.length !== 4) {
      callback(new Error('invalid length of join code'));
      return;
    }
    let params = [assessmentId, userId, authnUserId, group_name, join_code];
    sqldb.call('group_users_insert', params, function (err, _result) {
      if (err) {
        let params = {
          assessment_id: assessmentId,
        };
        sqldb.query(sql.get_group_config, params, function (err, result) {
          if (ERR(err, callback)) return;
          const permissions = result.rows[0];
          callback(null, false, permissions);
          return;
        });
      } else {
        callback(null, true);
      }
    });
  } else {
    // the join code input by user is not valid (not in format of groupname+4-character)
    let params = {
      assessment_id: assessmentId,
    };
    sqldb.query(sql.get_group_config, params, function (err, result) {
      if (ERR(err, callback)) return;
      const groupConfig = result.rows[0];
      callback(null, false, groupConfig);
    });
  }
};

/**
 * @param {string} groupName
 * @param {string} assessmentId
 * @param {string} userId
 * @param {string} authnUserId
 * @param {Function} callback
 */
module.exports.createGroup = function (groupName, assessmentId, userId, authnUserId, callback) {
  let params = {
    assessment_id: assessmentId,
    user_id: userId,
    authn_user_id: authnUserId,
    group_name: groupName,
  };
  //alphanumeric characters only
  let invalidGroupName = true;
  const letters = /^[0-9a-zA-Z]+$/;
  if (groupName.length <= 30 && groupName.match(letters)) {
    invalidGroupName = false;
    sqldb.query(sql.create_group, params, function (err, _result) {
      if (!err) {
        callback(null, true);
      } else {
        sqldb.query(sql.get_group_config, params, function (err, result) {
          if (ERR(err, callback)) return;
          const groupConfig = result.rows[0];
          const uniqueGroupName = true;
          callback(null, false, uniqueGroupName, null, groupConfig);
        });
      }
    });
  }
  if (invalidGroupName) {
    sqldb.query(sql.get_group_config, params, function (err, result) {
      if (ERR(err, callback)) return;
      const groupConfig = result.rows[0];
      const invalidGroupName = true;
      callback(null, false, null, invalidGroupName, groupConfig);
    });
  }
};

/**
 * @param {string} assessmentId
 * @param {string} userId
 * @param {string} authnUserId
 */
module.exports.leaveGroup = async function (assessmentId, userId, authnUserId) {
  await sqldb.runInTransactionAsync(async () => {
    const groupId = await module.exports.getGroupId(assessmentId, userId);
    const groupConfig = await module.exports.getGroupConfig(assessmentId);

    if (groupConfig.has_roles) {
      const groupInfo = await module.exports.getGroupInfo(groupId, groupConfig);
      const requiredRoles = groupInfo.rolesInfo.groupRoles.filter((role) => role.minimum > 0);

      // Reassign roles
      const currentSize = groupInfo.groupMembers.length;
      if (currentSize <= requiredRoles.length && currentSize > 1) {
        const assigneeUser = groupInfo.groupMembers.find((m) => m.user_id !== userId.toString());
        await sqldb.queryAsync(sql.transfer_group_roles, {
          group_id: groupId,
          user_id: userId,
          assignee_user_id: assigneeUser.user_id,
        });
      } else if (currentSize > 1) {
        // Get leaving user's required roles
        const requiredGroupRoleIds = await sqldb.queryValidatedRows(
          sql.get_user_required_roles,
          {
            group_id: groupId,
            user_id: userId,
          },
          GroupRoleIdSchema
        );

        for (const group_role_id of requiredGroupRoleIds) {
          //  Find someone with a non-required role
          const userToUpdate = await sqldb.queryValidatedZeroOrOneRow(
            sql.get_user_with_non_required_role,
            {
              group_id: groupId,
              user_id: userId,
            },
            UserToGroupRoleSchema
          );
          //  If we find someone, replace that non-required role with the required role
          if (userToUpdate !== null) {
            await sqldb.queryAsync(sql.update_group_user_role, {
              group_role_id,
              group_id: groupId,
              assignee_id: userToUpdate.user_id,
              assignee_old_role_id: userToUpdate.group_role_id,
            });
          } else {
            //  Otherwise, give the leaving user's role to someone at random
            const assigneeUser = groupInfo.groupMembers.find((m) => m.user_id !== userId);
            await sqldb.queryAsync(sql.assign_user_roles, {
              group_id: groupId,
              assignee_id: assigneeUser.user_id,
              group_role_id,
            });
          }
        }

        // Make sure no users are left with non-required roles
        await sqldb.queryAsync(sql.delete_non_required_roles, {
          group_id: groupId,
          assessment_id: assessmentId,
        });
      }
    }

    // Delete user from group and log
    await sqldb.queryAsync(sql.delete_group_users, {
      group_id: groupId,
      user_id: userId,
      authn_user_id: authnUserId,
    });
  });
  // const params = [assessmentId, userId, authnUserId];
  // sqldb.call('group_leave', params, function (err) {
  //   if (ERR(err, callback)) return;
  //   callback();
  // });
};

/**
 * @param {string} assessmentId
 * @param {string} userId
 * @returns {Promise<AssessmentLevelPermissions>}
 */
module.exports.getAssessmentLevelPermissions = async function (assessmentId, userId) {
  const params = { assessment_id: assessmentId, user_id: userId };
  return await sqldb.queryValidatedOneRow(
    sql.get_assessment_level_permissions,
    params,
    AssessmentLevelPermissionsSchema
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
  // Convert form data to valid input format for a SQL function
  const roleKeys = Object.keys(requestBody).filter((key) => key.startsWith('user_role_'));
  const userIdToRoleIdMap = {};
  for (const roleKey of roleKeys) {
    const [roleId, userId] = roleKey.replace('user_role_', '').split('-');
    if (userIdToRoleIdMap[userId] === undefined) {
      userIdToRoleIdMap[userId] = [roleId];
    } else {
      userIdToRoleIdMap[userId].push(roleId);
    }
  }

  const roleAssignments = Object.entries(userIdToRoleIdMap).map((entry) => ({
    user_id: entry[0],
    group_role_ids: entry[1].map((id) => parseInt(id)),
  }));

  let params = [assessmentId, roleAssignments, userId, authnUserId];
  await sqldb.callAsync('group_roles_update', params);
};
