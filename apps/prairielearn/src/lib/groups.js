var ERR = require('async-stacktrace');

var sqldb = require('@prairielearn/postgres');
var sql = sqldb.loadSqlEquiv(__filename);

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
    sqldb.query(sql.get_group_info, params, function (err, result) {
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
            group_info
          );
        } else {
          groupMember = true;
        }
        var join_code = group_info[0].name + '-' + group_info[0].join_code;
        var start = false;
        if (needsize <= 0) {
          start = true;
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
  const params = {
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
        sqldb.query(sql.get_config_info, params, function (err, result) {
          if (ERR(err, callback)) return;
          const permissions = result.rows[0];
          const uniqueGroupName = true;
          callback(null, false, uniqueGroupName, null, permissions);
        });
      }
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
