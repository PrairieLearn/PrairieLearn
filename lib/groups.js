var ERR = require('async-stacktrace');

var sqldb = require('@prairielearn/postgres');
var sql = sqldb.loadSqlEquiv(__filename);

module.exports.getGroupConfig = async function (assessmentId) {
  let params = { assessment_id: assessmentId };
  let result = await sqldb.queryAsync(sql.get_group_config, params);
  return result.rows[0];
};

module.exports.getGroupId = async function (assessmentId, userId) {
  let params = { assessment_id: assessmentId, user_id: userId };
  let result = await sqldb.queryAsync(sql.get_group_id, params);
  if (result.rowCount === 0) {
    return undefined;
  } else {
    return result.rows[0].id;
  }
};

module.exports.getGroupInfo = async function (groupId, groupConfig) {
  const groupInfo = {};

  let params = { group_id: groupId };
  let result = await sqldb.queryAsync(sql.get_group_members, params);
  groupInfo.groupMembers = result.rows;
  groupInfo.groupSize = result.rowCount;
  groupInfo.groupName = result.rows[0].group_name;
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

async function getRolesInfo(groupId, groupMembers) {
  const rolesInfo = {};

  // Get the current role assignments of the group
  let params = { group_id: groupId };
  let result = await sqldb.queryAsync(sql.get_role_assignments, params);
  let roleAssignments = {}; // {uid: [role_name]}
  result.rows.forEach((row) => {
    if (row.uid in roleAssignments) {
      roleAssignments[row.uid].push(row.role_name);
    } else {
      roleAssignments[row.uid] = [row.role_name];
    }
  });
  rolesInfo.roleAssignments = roleAssignments;

  // Get info on all group roles for the assessment
  params = { group_id: groupId };
  result = await sqldb.queryAsync(sql.get_group_roles, params);
  rolesInfo.groupRoles = result.rows;

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

module.exports.leaveGroup = function (assessmentId, userId, authnUserId, callback) {
  const params = [assessmentId, userId, authnUserId];
  sqldb.call('group_leave', params, function (err) {
    if (ERR(err, callback)) return;
    callback();
  });
};

module.exports.getAssessmentLevelPermissions = async function (assessmentId, userId) {
  const params = { assessment_id: assessmentId, user_id: userId };
  const result = await sqldb.queryAsync(sql.get_assessment_level_permissions, params);
  return result.rows[0];
};

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
