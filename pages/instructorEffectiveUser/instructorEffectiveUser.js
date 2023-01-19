var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

var error = require('../../prairielib/lib/error');
var sqldb = require('../../prairielib/lib/sql-db');
var sqlLoader = require('../../prairielib/lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

const moment = require('moment');

router.get('/', function (req, res, next) {
  if (
    !(
      res.locals.authz_data.authn_has_course_permission_preview ||
      res.locals.authz_data.authn_has_course_instance_permission_view
    )
  ) {
    return next(error.make(403, 'Access denied (must be course previewer or student data viewer)'));
  }

  debug(`GET: res.locals.req_date = ${res.locals.req_date}`);

  var params = {
    authn_user_id: res.locals.authn_user.user_id,
    course_id: res.locals.course.id,
    authn_course_role: res.locals.authz_data.authn_course_role,
    authn_course_instance_role: res.locals.authz_data.authn_course_instance_role
      ? res.locals.authz_data.authn_course_instance_role
      : 'None',
  };

  sqldb.queryOneRow(sql.select, params, function (err, result) {
    if (ERR(err, next)) return;
    _.assign(res.locals, result.rows[0]);

    res.locals.ipaddress = req.ip;
    // Trim out IPv6 wrapper on IPv4 addresses
    if (res.locals.ipaddress.substr(0, 7) === '::ffff:') {
      res.locals.ipaddress = res.locals.ipaddress.substr(7);
    }
    res.locals.req_date_for_display = moment(res.locals.req_date).toISOString(true);

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

router.post('/', function (req, res, next) {
  if (
    !(
      res.locals.authz_data.authn_has_course_permission_preview ||
      res.locals.authz_data.authn_has_course_instance_permission_view
    )
  ) {
    return next(error.make(403, 'Access denied (must be course previewer or student data viewer)'));
  }

  if (req.body.__action === 'reset') {
    res.clearCookie('pl_requested_uid');
    res.clearCookie('pl_requested_course_role');
    res.clearCookie('pl_requested_course_instance_role');
    res.clearCookie('pl_requested_mode');
    res.clearCookie('pl_requested_date');
    res.cookie('pl_requested_data_changed');
    res.redirect(req.originalUrl);
  } else if (req.body.__action === 'changeUid') {
    res.cookie('pl_requested_uid', req.body.pl_requested_uid, {
      maxAge: 60 * 60 * 1000,
    });
    res.cookie('pl_requested_data_changed');
    res.redirect(req.originalUrl);
  } else if (req.body.__action === 'changeCourseRole') {
    res.cookie('pl_requested_course_role', req.body.pl_requested_course_role, {
      maxAge: 60 * 60 * 1000,
    });
    res.cookie('pl_requested_data_changed');
    res.redirect(req.originalUrl);
  } else if (req.body.__action === 'changeCourseInstanceRole') {
    res.cookie('pl_requested_course_instance_role', req.body.pl_requested_course_instance_role, {
      maxAge: 60 * 60 * 1000,
    });
    res.cookie('pl_requested_data_changed');
    res.redirect(req.originalUrl);
  } else if (req.body.__action === 'changeMode') {
    res.cookie('pl_requested_mode', req.body.pl_requested_mode, {
      maxAge: 60 * 60 * 1000,
    });
    res.cookie('pl_requested_data_changed');
    res.redirect(req.originalUrl);
  } else if (req.body.__action === 'changeDate') {
    debug(`POST: req.body.pl_requested_date = ${req.body.pl_requested_date}`);
    let date = moment(req.body.pl_requested_date, moment.ISO_8601);
    if (!date.isValid()) {
      return next(error.make(400, `invalid requested date: ${req.body.pl_requested_date}`));
    }
    res.cookie('pl_requested_date', date.toISOString(), {
      maxAge: 60 * 60 * 1000,
    });
    res.cookie('pl_requested_data_changed');
    res.redirect(req.originalUrl);
  } else {
    return next(
      error.make(400, 'unknown action: ' + res.locals.__action, {
        __action: req.body.__action,
        body: req.body,
      })
    );
  }
});

module.exports = router;
