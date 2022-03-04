var ERR = require('async-stacktrace');

var sqldb = require('../../../prairielib/lib/sql-db');
var sqlLoader = require('../../../prairielib/lib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports.getConfigInfo = function (req, res, next) {
  var params = {
    assessment_id: res.locals.assessment.id,
    user_id: res.locals.user.user_id,
  };

  sqldb.query(sql.get_config_info, params, function (err, result) {
    if (ERR(err, next)) return;
    res.locals.permissions = result.rows[0];
    res.locals.minsize = result.rows[0].minimum || 0;
    res.locals.maxsize = result.rows[0].maximum || 999;
    sqldb.query(sql.get_group_info, params, function (err, result) {
      if (ERR(err, next)) return;
      res.locals.groupsize = result.rowCount;
      res.locals.needsize = res.locals.minsize - res.locals.groupsize;
      if (res.locals.groupsize > 0) {
        res.locals.group_info = result.rows;
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
      next();
    });
  });
};

module.exports.joinGroup = function (req, res, next) {
  try {
    const group_name = req.body.join_code.split('-')[0];
    const join_code = req.body.join_code.split('-')[1].toUpperCase();
    if (join_code.length !== 4) {
      throw 'invalid length of join code';
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
          if (ERR(err, next)) return;
          res.locals.permissions = result.rows[0];
          res.locals.groupsize = 0;
          //display the error on frontend
          res.locals.used_join_code = req.body.join_code;
          //res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
          next();
          return;
        });
      } else {
        res.redirect(req.originalUrl);
      }
    });
  } catch (err) {
    // the join code input by user is not valid (not in format of groupname+4-character)
    let params = {
      assessment_id: res.locals.assessment.id,
    };
    sqldb.query(sql.get_config_info, params, function (err, result) {
      if (ERR(err, next)) return;
      res.locals.permissions = result.rows[0];
      res.locals.groupsize = 0;
      //display the error on frontend
      res.locals.used_join_code = req.body.join_code;
      next();
    });
  }
};

module.exports.createGroup = function (req, res, next) {
  const params = {
    assessment_id: res.locals.assessment.id,
    user_id: res.locals.user.user_id,
    authn_user_id: res.locals.authn_user.user_id,
    group_name: req.body.groupName,
  };
  //alpha and numeric characters only
  let invalidGroupName = true;
  const letters = /^[0-9a-zA-Z]+$/;
  if (req.body.groupName.length <= 30 && req.body.groupName.match(letters)) {
    invalidGroupName = false;
    //try to create a group
    sqldb.query(sql.create_group, params, function (err, _result) {
      if (!err) {
        res.redirect(req.originalUrl);
      } else {
        sqldb.query(sql.get_config_info, params, function (err, result) {
          if (ERR(err, next)) return;
          res.locals.permissions = result.rows[0];
          res.locals.groupsize = 0;
          res.locals.uniqueGroupName = true;
          next();
        });
      }
    });
  }
  if (invalidGroupName) {
    sqldb.query(sql.get_config_info, params, function (err, result) {
      if (ERR(err, next)) return;
      res.locals.permissions = result.rows[0];
      res.locals.groupsize = 0;
      res.locals.invalidGroupName = true;
      next();
    });
  }
};
module.exports.leaveGroup = function (req, res, next) {
  const params = {
    assessment_id: res.locals.assessment.id,
    user_id: res.locals.user.user_id,
    authn_user_id: res.locals.authn_user.user_id,
  };
  sqldb.query(sql.leave_group, params, function (err, _result) {
    if (ERR(err, next)) return;
    next();
  });
};
