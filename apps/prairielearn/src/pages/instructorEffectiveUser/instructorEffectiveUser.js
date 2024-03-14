//@ts-check
const ERR = require('async-stacktrace');
const _ = require('lodash');
import * as express from 'express';
import * as path from 'path';
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

const { parseISO, isValid } = require('date-fns');
const { format, utcToZonedTime } = require('date-fns-tz');

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

    // This page can be mounted under `/pl/course/...`, in which case we won't
    // have a course instance to get a display timezone from. In that case, we'll
    // fall back to the course, and then to the institution. All institutions must
    // have a display timezone, so we're always guaranteed to have one.
    const displayTimezone =
      res.locals.course_instance?.display_timezone ??
      res.locals.course.display_timezone ??
      res.locals.institution.display_timezone;

    res.locals.true_req_date_for_display = format(
      utcToZonedTime(res.locals.true_req_date, displayTimezone),
      "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
      {
        timeZone: displayTimezone,
      },
    );
    res.locals.req_date_for_display = format(
      utcToZonedTime(res.locals.req_date, displayTimezone),
      "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
      {
        timeZone: displayTimezone,
      },
    );

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
    res.cookie('pl_requested_data_changed', 'true');
    res.redirect(req.originalUrl);
  } else if (req.body.__action === 'changeUid') {
    res.cookie('pl_requested_uid', req.body.pl_requested_uid, {
      maxAge: 60 * 60 * 1000,
    });
    res.cookie('pl_requested_data_changed', 'true');
    res.redirect(req.originalUrl);
  } else if (req.body.__action === 'changeCourseRole') {
    res.cookie('pl_requested_course_role', req.body.pl_requested_course_role, {
      maxAge: 60 * 60 * 1000,
    });
    res.cookie('pl_requested_data_changed', 'true');
    res.redirect(req.originalUrl);
  } else if (req.body.__action === 'changeCourseInstanceRole') {
    res.cookie('pl_requested_course_instance_role', req.body.pl_requested_course_instance_role, {
      maxAge: 60 * 60 * 1000,
    });
    res.cookie('pl_requested_data_changed', 'true');
    res.redirect(req.originalUrl);
  } else if (req.body.__action === 'changeMode') {
    res.cookie('pl_requested_mode', req.body.pl_requested_mode, {
      maxAge: 60 * 60 * 1000,
    });
    res.cookie('pl_requested_data_changed', 'true');
    res.redirect(req.originalUrl);
  } else if (req.body.__action === 'changeDate') {
    debug(`POST: req.body.pl_requested_date = ${req.body.pl_requested_date}`);
    let date = parseISO(req.body.pl_requested_date);
    if (!isValid(date)) {
      return next(error.make(400, `invalid requested date: ${req.body.pl_requested_date}`));
    }
    res.cookie('pl_requested_date', date.toISOString(), {
      maxAge: 60 * 60 * 1000,
    });
    res.cookie('pl_requested_data_changed', 'true');
    res.redirect(req.originalUrl);
  } else {
    return next(error.make(400, 'unknown action: ' + res.locals.__action));
  }
});

export default router;
