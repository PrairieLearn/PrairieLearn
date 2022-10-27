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
var groupAssessmentHelper = require('../../lib/groups');

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
        groupAssessmentHelper.getGroupInfo(
          res.locals.assessment.id,
          res.locals.user.user_id,
          function (
            err,
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
          ) {
            if (ERR(err, next)) return;
            res.locals.permissions = permissions;
            res.locals.minsize = minsize;
            res.locals.maxsize = maxsize;
            res.locals.groupsize = groupsize;
            res.locals.needsize = needsize;
            res.locals.group_info = group_info;
            res.locals.join_code = join_code;
            res.locals.start = start;
            res.locals.used_join_code = used_join_code;
            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
          }
        );
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
    groupAssessmentHelper.joinGroup(
      req.body.join_code,
      res.locals.assessment.id,
      res.locals.user.user_id,
      res.locals.authn_user.user_id,
      function (err, succeeded, permissions) {
        if (ERR(err, next)) return err;
        if (succeeded) {
          res.redirect(req.originalUrl);
        } else {
          res.locals.permissions = permissions;
          res.locals.groupsize = 0;
          res.locals.used_join_code = req.body.join_code;
          res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        }
      }
    );
  } else if (req.body.__action === 'create_group') {
    groupAssessmentHelper.createGroup(
      req.body.groupName,
      res.locals.assessment.id,
      res.locals.user.user_id,
      res.locals.authn_user.user_id,
      function (err, succeeded, uniqueGroupName, invalidGroupName, permissions) {
        if (ERR(err, next)) return;
        if (succeeded) {
          res.redirect(req.originalUrl);
        } else {
          if (invalidGroupName) {
            res.locals.invalidGroupName = true;
          } else {
            res.locals.uniqueGroupName = uniqueGroupName;
          }
          res.locals.permissions = permissions;
          res.locals.groupsize = 0;
          res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        }
      }
    );
  } else if (req.body.__action === 'leave_group') {
    groupAssessmentHelper.leaveGroup(
      res.locals.assessment.id,
      res.locals.user.user_id,
      res.locals.authn_user.user_id,
      function (err) {
        if (ERR(err, next)) return;
        res.redirect(req.originalUrl);
      }
    );
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
