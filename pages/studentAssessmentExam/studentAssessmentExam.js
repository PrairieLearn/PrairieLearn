var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

const { checkPasswordOrRedirect } = require('../../middlewares/studentAssessmentAccess');
var error = require('../../prairielib/lib/error');
var assessment = require('../../lib/assessment');
var sqldb = require('../../prairielib/lib/sql-db');
var sqlLoader = require('../../prairielib/lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function (req, res, next) {
  if (res.locals.assessment.type !== 'Exam') return next();
  if (res.locals.assessment.multiple_instance) {
    // The user has landed on this page to create a new assessment instance.
    //
    // Before allowing the user to create a new assessment instance, we need
    // to check if the current access rules require a password. If they do,
    // we'll ensure that the password has already been entered before allowing
    // students to create and start a new assessment instance.
    if (!checkPasswordOrRedirect(req, res)) return;

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  } else {
    var params = {
      assessment_id: res.locals.assessment.id,
      user_id: res.locals.user.user_id,
    };
    sqldb.query(sql.select_single_assessment_instance, params, function (err, result) {
      if (ERR(err, next)) return;
      if (result.rowCount === 0) {
        // Before allowing the user to create a new assessment instance, we need
        // to check if the current access rules require a password. If they do,
        // we'll ensure that the password has already been entered before allowing
        // students to create and start a new assessment instance.
        if (!checkPasswordOrRedirect(req, res)) return;

        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      } else {
        res.redirect(res.locals.urlPrefix + '/assessment_instance/' + result.rows[0].id);
      }
    });
  }
});

router.post('/', function (req, res, next) {
  if (res.locals.assessment.type !== 'Exam') return next();

  // No, you do not need to verify authz_result.authorized_edit (indeed, this flag exists
  // only for an assessment instance, not an assessment).
  //
  // The assessment that is created here will be owned by the effective user. The only
  // reason to worry, therefore, is if the effective user has a different UID than the
  // authn user. This is only allowed, however, if the authn user has permission to edit
  // student data in the course instance (which has already been checked), exactly the
  // permission required to create an assessment for the effective user.

  if (req.body.__action === 'new_instance') {
    // Before allowing the user to create a new assessment instance, we need
    // to check if the current access rules require a password. If they do,
    // we'll ensure that the password has already been entered before allowing
    // students to create and start a new assessment instance.
    if (!checkPasswordOrRedirect(req, res)) return;

    assessment.makeAssessmentInstance(
      res.locals.assessment.id,
      res.locals.user.user_id,
      res.locals.assessment.group_work,
      res.locals.authn_user.user_id,
      res.locals.authz_data.mode,
      res.locals.authz_result.time_limit_min,
      res.locals.req_date,
      (err, assessment_instance_id) => {
        if (ERR(err, next)) return;
        res.redirect(res.locals.urlPrefix + '/assessment_instance/' + assessment_instance_id);
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
