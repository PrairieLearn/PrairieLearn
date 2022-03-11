var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();
var path = require('path');
var debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const { checkPasswordOrRedirect } = require('../../middlewares/studentAssessmentAccess');
var error = require('../../prairielib/lib/error');
var assessment = require('../../lib/assessment');
var sqldb = require('../../prairielib/lib/sql-db');
var sqlLoader = require('../../prairielib/lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function (req, res, next) {
  debug('GET');
  if (res.locals.assessment.type !== 'Homework') return next();
  debug('is Homework');
  if (res.locals.assessment.multiple_instance) {
    return next(
      error.makeWithData('"Homework" assessments do not support multiple instances', {
        assessment: res.locals.assessment,
      })
    );
  }

  debug('fetching assessment_instance');
  var params = {
    assessment_id: res.locals.assessment.id,
    user_id: res.locals.user.user_id,
  };

  sqldb.query(sql.find_single_assessment_instance, params, function (err, result) {
    if (ERR(err, next)) return;
    if (result.rowCount === 0) {
      debug('no assessment instance');

      // No, you do not need to verify authz_result.authorized_edit (indeed, this flag exists
      // only for an assessment instance, not an assessment).
      //
      // The assessment that is created here will be owned by the effective user. The only
      // reason to worry, therefore, is if the effective user has a different UID than the
      // authn user. This is only allowed, however, if the authn user has permission to edit
      // student data in the course instance (which has already been checked), exactly the
      // permission required to create an assessment for the effective user.

      // If this assessment is group work and there is no existing instance,
      // show the group info page.
      if (res.locals.assessment.group_work) {
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
            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
          });
        });
      } else {
        // Before allowing the user to create a new assessment instance, we need
        // to check if the current access rules require a password. If they do,
        // we'll ensure that the password has already been entered before allowing
        // students to create and start a new assessment instance.
        if (!checkPasswordOrRedirect(req, res)) return;

        const time_limit_min = null;
        assessment.makeAssessmentInstance(
          res.locals.assessment.id,
          res.locals.user.user_id,
          res.locals.assessment.group_work,
          res.locals.authn_user.user_id,
          res.locals.authz_data.mode,
          time_limit_min,
          res.locals.authz_data.date,
          (err, assessment_instance_id) => {
            if (ERR(err, next)) return;
            debug('redirecting');
            res.redirect(res.locals.urlPrefix + '/assessment_instance/' + assessment_instance_id);
          }
        );
      }
    } else {
      debug('redirecting');
      res.redirect(res.locals.urlPrefix + '/assessment_instance/' + result.rows[0].id);
    }
  });
});

router.post('/', function (req, res, next) {
  if (res.locals.assessment.type !== 'Homework') return next();
  if (req.body.__action === 'new_instance') {
    var params = {
      assessment_id: res.locals.assessment.id,
      user_id: res.locals.user.user_id,
    };
    sqldb.query(sql.find_single_assessment_instance, params, function (err, result) {
      if (ERR(err, next)) return;
      if (result.rowCount === 0) {
        // Before allowing the user to create a new assessment instance, we need
        // to check if the current access rules require a password. If they do,
        // we'll ensure that the password has already been entered before allowing
        // students to create and start a new assessment instance.
        if (!checkPasswordOrRedirect(req, res)) return;

        const time_limit_min = null;
        assessment.makeAssessmentInstance(
          res.locals.assessment.id,
          res.locals.user.user_id,
          res.locals.assessment.group_work,
          res.locals.authn_user.user_id,
          res.locals.authz_data.mode,
          time_limit_min,
          res.locals.authz_data.date,
          (err, assessment_instance_id) => {
            if (ERR(err, next)) return;
            debug('redirecting');
            res.redirect(res.locals.urlPrefix + '/assessment_instance/' + assessment_instance_id);
          }
        );
      } else {
        debug('redirecting');
        res.redirect(res.locals.urlPrefix + '/assessment_instance/' + result.rows[0].id);
      }
    });
  } else if (req.body.__action === 'join_group') {
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
            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
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
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      });
    }
  } else if (req.body.__action === 'create_group') {
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
            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
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
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      });
    }
  } else if (req.body.__action === 'leave_group') {
    const params = {
      assessment_id: res.locals.assessment.id,
      user_id: res.locals.user.user_id,
      authn_user_id: res.locals.authn_user.user_id,
    };
    sqldb.query(sql.leave_group, params, function (err, _result) {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else {
    return next(
      error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      })
    );
  }
});

module.exports = router;
