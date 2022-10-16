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
    sqldb.query(query, params, function (err, result) {
      if (ERR(err, callback)) return;
      var groupMember;
      var group_info;
      const groupsize = result.rowCount;
      const needsize = minsize - groupsize;
      if (groupsize > 0) {
        group_info = result.rows;
        if (group_info[0] === undefined) {
          groupMember = false;
          callback(
            null,
            groupMember,
            permissions,
            minsize,
            maxsize,
            groupsize,
            needsize,
            usingGroupRoles,
            group_info
          );
        } else {
          groupMember = true;
        }
        var join_code = group_info[0].name + '-' + group_info[0].join_code;
        var start = false;
        if (needsize <= 0 && !usingGroupRoles) {
          start = true;
        } else if (needsize <= 0 && usingGroupRoles) {
          let params = [assessmentId, userId];
          // FIXME: when start is true, button is still disabled
          console.log('call group info roles validate');
          sqldb.call('group_info_roles_validate', params, function (err, result) {
            if (ERR(err, callback)) return;
            start = result.rowCount === 0;
            console.log(start);
            var used_join_code;
            if (groupsize >= maxsize) {
              used_join_code = true;
            }
            callback(
              null,
              groupMember,
              permissions,
              minsize,
              maxsize,
              groupsize,
              needsize,
              usingGroupRoles,
              group_info,
              join_code,
              start,
              used_join_code
            );
            return;
          })
        }
      }
      var used_join_code;
      if (groupsize >= maxsize) {
        used_join_code = true;
      }
      callback(
        null,
        groupMember,
        permissions,
        minsize,
        maxsize,
        groupsize,
        needsize,
        usingGroupRoles,
        group_info,
        join_code,
        start,
        used_join_code
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
  const params = {
    assessment_id: assessmentId,
    user_id: userId,
    authn_user_id: authnUserId,
  };
  sqldb.query(sql.leave_group, params, function (err) {
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
    if (result.rows.length > 0) {
      callback(null, result.rows);
    } else {
      sqldb.call('group_roles_update', params, function (err, _result) {
        if (ERR(err, callback)) return;
        callback(null, []);
      });
    }
  });
};
