var ERR = require('async-stacktrace');

var sqldb = require('../prairielib/lib/sql-db');
var sqlLoader = require('../prairielib/lib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports.getGroupInfo = function (res, callback) {
  var params = {
    assessment_id: res.locals.assessment.id,
    user_id: res.locals.user.user_id,
  };

  sqldb.query(sql.get_config_info, params, function (err, result) {
    if (ERR(err, callback)) return;
    res.locals.permissions = result.rows[0];
    res.locals.minsize = result.rows[0].minimum || 0;
    res.locals.maxsize = result.rows[0].maximum || 999;
    sqldb.query(sql.get_group_info, params, function (err, result) {
      if (ERR(err, callback)) return;
      res.locals.groupsize = result.rowCount;
      res.locals.needsize = res.locals.minsize - res.locals.groupsize;
      if (res.locals.groupsize > 0) {
        res.locals.group_info = result.rows;
        if (res.locals.group_info[0] === undefined) {
          var notGroupMember = true;
          callback(null, notGroupMember);
        }
        res.locals.join_code =
          res.locals.group_info[0].name + '-' + res.locals.group_info[0].join_code;
        res.locals.start = false;
        if (res.locals.needsize <= 0) {
          res.locals.start = true;
        }
      }
      if (res.locals.groupsize >= res.locals.maxsize) {
        res.locals.used_join_code = true;
      } else {
        res.locals.used_join_code = undefined;
      }
      callback();
    });
  });
};

module.exports.joinGroup = function (joinCode, res, callback) {
  var splitJoinCode = joinCode.split('-');
  const validJoinCode = splitJoinCode.length === 2;
  if (validJoinCode) {
    const group_name = splitJoinCode[0];
    const join_code = splitJoinCode[1].toUpperCase();
    if (join_code.length !== 4) {
      callback(new Error('invalid length of join code'), null);
      return;
    }
    let params = [
      res.locals.assessment.id,
      res.locals.user.user_id,
      res.locals.authn_user.user_id,
      group_name,
      join_code,
    ];
    sqldb.call('group_users_insert', params, function (err, _result) {
      if (err) {
        let params = {
          assessment_id: res.locals.assessment.id,
        };
        sqldb.query(sql.get_config_info, params, function (err, result) {
          if (ERR(err, callback)) return;
          res.locals.permissions = result.rows[0];
          res.locals.groupsize = 0;
          res.locals.used_join_code = joinCode;
          callback(null, false);
          return;
        });
      } else {
        callback(null, true);
      }
    });
  } else {
    // the join code input by user is not valid (not in format of groupname+4-character)
    let params = {
      assessment_id: res.locals.assessment.id,
    };
    sqldb.query(sql.get_config_info, params, function (err, result) {
      if (ERR(err, callback)) return;
      res.locals.permissions = result.rows[0];
      res.locals.groupsize = 0;
      res.locals.used_join_code = joinCode;
      callback(null, false);
    });
  }
};

module.exports.createGroup = function (groupName, res, callback) {
  const params = {
    assessment_id: res.locals.assessment.id,
    user_id: res.locals.user.user_id,
    authn_user_id: res.locals.authn_user.user_id,
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
          res.locals.permissions = result.rows[0];
          res.locals.groupsize = 0;
          res.locals.uniqueGroupName = true;
          callback(null, false);
        });
      }
    });
  }
  if (invalidGroupName) {
    sqldb.query(sql.get_config_info, params, function (err, result) {
      if (ERR(err, callback)) return;
      res.locals.permissions = result.rows[0];
      res.locals.groupsize = 0;
      res.locals.invalidGroupName = true;
      callback(null, false);
    });
  }
};

module.exports.leaveGroup = function (res, callback) {
  const params = {
    assessment_id: res.locals.assessment.id,
    user_id: res.locals.user.user_id,
    authn_user_id: res.locals.authn_user.user_id,
  };
  sqldb.query(sql.leave_group, params, function (err) {
    if (ERR(err, callback)) return;
    callback();
  });
};
