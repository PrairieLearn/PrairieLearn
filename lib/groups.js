var ERR = require('async-stacktrace');

var sqldb = require('../prairielib/lib/sql-db');
var sqlLoader = require('../prairielib/lib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports.getGroupInfo = function (assessmentId, userId, callback) {
  var params = {
    assessment_id: assessmentId,
    user_id: userId,
  };
  sqldb.query(sql.get_config_info, params, function (err, result) {
    if (ERR(err, callback)) return;
    const permissions = result.rows[0];
    const minsize = result.rows[0].minimum || 0;
    const maxsize = result.rows[0].maximum || 999;
    const usingGroupRoles = result.rows[0].using_group_roles;

    const query = usingGroupRoles ? sql.get_group_info_with_roles : sql.get_group_info;
    sqldb.query(query, params, async function (err, result) {
      if (ERR(err, callback)) return;

      const isGroupMember = result.rowCount > 0 && result.rows[0] !== undefined;
      const group_info = result.rows;
      const groupsize = result.rowCount;
      const needsize = minsize - groupsize;
      const used_join_code = groupsize >= maxsize ? true : undefined;
      let start;
      let join_code;
      let validationErrors;
      let disabledRoles;

      if (isGroupMember) {
        join_code = group_info[0].name + '-' + group_info[0].join_code;

        if (usingGroupRoles) {
          // Evaluate if assessment is able to start based on group role config errors
          const params = [assessmentId, userId];
          const result = await sqldb.callAsync('group_roles_validate', params);
          start = needsize <= 0 && result.rowCount === 0;
          validationErrors = result.rows;

          // TODO: Identify any disabled roles based on group size, role min
          // 1. Get group roles
          disabledRoles = ["Contributor"]
        } else {
          start = needsize <= 0;
        }
      }

      callback(
        null,
        isGroupMember,
        permissions,
        minsize,
        maxsize,
        groupsize,
        needsize,
        usingGroupRoles,
        group_info,
        join_code,
        start,
        used_join_code,
        validationErrors,
        disabledRoles
      );
    });
  });
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

module.exports.getGroupRoles = function (assessmentId, callback) {
  const params = {
    assessment_id: assessmentId,
  };
  sqldb.query(sql.get_group_roles, params, function (err, result) {
    if (ERR(err, callback)) return;
    const group_roles = result.rows;
    callback(group_roles);
  });
};

// Returns a given user's assessment-level permissions (i.e. can_assign_roles ...)
module.exports.getAssessmentLevelPermissions = function (assessmentId, userId, callback) {
  const params = {
    assessment_id: assessmentId,
    user_id: userId,
  };
  sqldb.query(sql.get_assessment_level_permissions, params, function (err, result) {
    if (ERR(err, callback)) return;
    callback(result.rows[0]);
  });
};

module.exports.updateGroupRoles = function (
  requestBody,
  assessmentId,
  userId,
  authnUserId,
  callback
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

  const roleAssignments = [];
  Object.entries(uidToRoleIdMap).forEach((entry) => {
    const roleAssignment = {
      uid: entry[0],
      group_role_ids: entry[1].map((id) => parseInt(id)),
    };
    roleAssignments.push(roleAssignment);
  });

  let params = [assessmentId, roleAssignments, userId, authnUserId];
  sqldb.call('group_roles_update', params, function (err, _result) {
    if (ERR(err, callback)) return;
    callback();
  });
};
