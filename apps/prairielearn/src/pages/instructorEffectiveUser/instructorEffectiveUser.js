// @ts-check
const ERR = require('async-stacktrace');
import * as _ from 'lodash';
import * as express from 'express';
import debugfn from 'debug';
import { parseISO, isValid } from 'date-fns';
import { format, utcToZonedTime } from 'date-fns-tz';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { clearCookie, setCookie } from '../../lib/cookie';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);
const debug = debugfn('prairielearn:instructorEffectiveUser');

router.get('/', function (req, res, next) {
  if (
    !(
      res.locals.authz_data.authn_has_course_permission_preview ||
      res.locals.authz_data.authn_has_course_instance_permission_view
    )
  ) {
    return next(
      new error.HttpStatusError(
        403,
        'Access denied (must be course previewer or student data viewer)',
      ),
    );
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
    return next(
      new error.HttpStatusError(
        403,
        'Access denied (must be course previewer or student data viewer)',
      ),
    );
  }

  if (req.body.__action === 'reset') {
    clearCookie(res, ['pl_requested_uid', 'pl2_requested_uid']);
    clearCookie(res, ['pl_requested_course_role', 'pl2_requested_course_role']);
    clearCookie(res, ['pl_requested_course_instance_role', 'pl2_requested_course_instance_role']);
    clearCookie(res, ['pl_requested_mode', 'pl2_requested_mode']);
    clearCookie(res, ['pl_requested_date', 'pl2_requested_date']);
    setCookie(res, ['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    res.redirect(req.originalUrl);
  } else if (req.body.__action === 'changeUid') {
    setCookie(res, ['pl_requested_uid', 'pl2_requested_uid'], req.body.pl_requested_uid, {
      maxAge: 60 * 60 * 1000,
    });
    setCookie(res, ['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    res.redirect(req.originalUrl);
  } else if (req.body.__action === 'changeCourseRole') {
    setCookie(
      res,
      ['pl_requested_course_role', 'pl2_requested_course_role'],
      req.body.pl_requested_course_role,
      {
        maxAge: 60 * 60 * 1000,
      },
    );
    setCookie(res, ['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    res.redirect(req.originalUrl);
  } else if (req.body.__action === 'changeCourseInstanceRole') {
    setCookie(
      res,
      ['pl_requested_course_instance_role', 'pl2_requested_course_instance_role'],
      req.body.pl_requested_course_instance_role,
      {
        maxAge: 60 * 60 * 1000,
      },
    );
    setCookie(res, ['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    res.redirect(req.originalUrl);
  } else if (req.body.__action === 'changeMode') {
    setCookie(res, ['pl_requested_mode', 'pl2_requested_mode'], req.body.pl_requested_mode, {
      maxAge: 60 * 60 * 1000,
    });
    setCookie(res, ['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    res.redirect(req.originalUrl);
  } else if (req.body.__action === 'changeDate') {
    let date = parseISO(req.body.pl_requested_date);
    if (!isValid(date)) {
      return next(
        new error.HttpStatusError(400, `invalid requested date: ${req.body.pl_requested_date}`),
      );
    }
    setCookie(res, ['pl_requested_date', 'pl2_requested_date'], date.toISOString(), {
      maxAge: 60 * 60 * 1000,
    });
    setCookie(res, ['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    res.redirect(req.originalUrl);
  } else {
    return next(new error.HttpStatusError(400, 'unknown action: ' + res.locals.__action));
  }
});

export default router;
