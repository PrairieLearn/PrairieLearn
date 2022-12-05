var ERR = require('async-stacktrace');

var sqldb = require('../prairielib/lib/sql-db');
var sqlLoader = require('../prairielib/lib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports.getGroupInfo = async function (assessmentId, userId) {
  const groupInfo = {};

  // Get config info
  let params = {assessment_id: assessmentId, user_id: userId};
  let result = await sqldb.queryAsync(sql.get_config_info, params);
  groupInfo.permissions = result.rows[0];
  groupInfo.minSize = result.rows[0].minimum || 0;
  groupInfo.maxSize = result.rows[0].maximum || 999;
  groupInfo.hasRoles = result.rows[0].has_roles;

  // Get group info
  result = await sqldb.queryAsync(sql.get_group_info, params);
  groupInfo.groupInfo = result.rows; // TODO: Better name: "groupMembers" ?
  groupInfo.groupSize = result.rowCount;
  groupInfo.isGroupMember = result.rowCount > 0;
  groupInfo.usedJoinCode = groupInfo.groupSize >= groupInfo.maxSize ? true : undefined;

  if (groupInfo.isGroupMember) {
    groupInfo.joinCode = groupInfo.groupInfo[0].name + '-' + groupInfo.groupInfo[0].join_code;
    const needSize = groupInfo.minSize - groupInfo.groupSize;
    if (groupInfo.hasRoles) {
      const rolesInfo = await getRolesInfo(assessmentId, userId, groupInfo.groupSize, groupInfo.groupInfo);
      groupInfo.start = groupInfo.needSize <= 0 && rolesInfo.rolesAreBalanced && rolesInfo.validationErrors.length === 0;
      groupInfo.rolesInfo = rolesInfo;
    } else {
      groupInfo.start = needSize <= 0;
    }
  }

  return groupInfo;
};

async function getRolesInfo(assessmentId, userId, groupSize, groupMembers) {
  const rolesInfo = {};

  // Get info on all group roles for the assessment
  let params = { assessment_id: assessmentId };
  let result = await sqldb.queryAsync(sql.get_group_roles, params);
  rolesInfo.groupRoles = result.rows;

  // Identify errors for any roles where count is not between max and min
  rolesInfo.validationErrors = rolesInfo.groupRoles.filter((role) => 
    role.count < role.minimum || role.count > role.maximum
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
  rolesInfo.disabledRoles = groupSize <= requiredRoleNames.length ? optionalRoleNames : [];

  // Check if any users has too many roles when the group size matches the # of required roles
  if (groupSize >= requiredRoleNames.length) {
    rolesInfo.rolesAreBalanced = groupMembers.every((member) => member.role_names.split(', ').length === 1);
  } else {
    rolesInfo.rolesAreBalanced = true;
  }

  return rolesInfo;
};

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
        sqldb.query(sql.get_config_info, params, function (err, result) {
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
    sqldb.query(sql.get_config_info, params, function (err, result) {
      if (ERR(err, callback)) return;
      const permissions = result.rows[0];
      callback(null, false, permissions);
    });
  }
};

module.exports.createGroup = function (groupName, assessmentId, userId, authnUserId, callback) {
  let params = {
    assessment_id: assessmentId,
    user_id: userId,
    authn_user_id: authnUserId,
    group_name: groupName,
    group_role_id: null,
  };
  //alphanumeric characters only
  let invalidGroupName = true;
  const letters = /^[0-9a-zA-Z]+$/;
  if (groupName.length <= 30 && groupName.match(letters)) {
    invalidGroupName = false;
    sqldb.query(sql.get_creator_role, params, function (err, result) {
      if (ERR(err, callback)) return;
      params.group_role_id = result.rows[0].id;
      sqldb.query(sql.create_group, params, function (err, _result) {
        if (!err) {
          callback(null, true);
        } else {
          sqldb.query(sql.get_config_info, params, function (err, result) {
            if (ERR(err, callback)) return;
            const permissions = result.rows[0];
            const uniqueGroupName = true;
            callback(null, false, uniqueGroupName, null, permissions);
          });
        }
      });
    });
  }
  if (invalidGroupName) {
    sqldb.query(sql.get_config_info, params, function (err, result) {
      if (ERR(err, callback)) return;
      const permissions = result.rows[0];
      const invalidGroupName = true;
      callback(null, false, null, invalidGroupName, permissions);
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
  const params = {assessment_id: assessmentId, user_id: userId};
  const result = await sqldb.queryAsync(sql.get_assessment_level_permissions, params);
  return result.rows[0];
};

module.exports.updateGroupRoles = async function (
  requestBody,
  assessmentId,
  userId,
  authnUserId,
) {
  // Convert form data to valid input format for a SQL function
  const roleKeys = Object.keys(requestBody).filter((key) => !key.startsWith('__'));
  const uidToRoleIdMap = {};
  for (const roleKey of roleKeys) {
    const [roleId, uid] = roleKey.split('-');
    if (uidToRoleIdMap[uid] === undefined) {
      uidToRoleIdMap[uid] = [roleId];
    } else {
      uidToRoleIdMap[uid].push(roleId);
    }
  }

  const roleAssignments = Object.entries(uidToRoleIdMap).map((entry) => ({
    uid: entry[0],
    group_role_ids: entry[1].map((id) => parseInt(id)),
  }));

  let params = [assessmentId, roleAssignments, userId, authnUserId];
  await sqldb.callAsync('group_roles_update', params);
};
