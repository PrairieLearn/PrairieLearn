const ERR = require('async-stacktrace');
const express = require('express');

const config = require('../../lib/config');
const csrf = require('../../lib/csrf');
const sqldb = require('../../prairielib/lib/sql-db');

var router = express.Router();

router.get('/', (req, res, next) => {
  if (!config.devMode) {
    return next(new Error('devMode logins are not enabled'));
  }

  var authUid = config.authUid;
  var authName = config.authName;
  var authUin = config.authUin;

  // We allow unit tests to override the user. Unit tests may also override the req_date
  // (middlewares/date.js) and the req_mode (middlewares/authzCourseOrInstance.js).

  if (req.cookies.pl_test_user === 'test_student') {
    authUid = 'student@illinois.edu';
    authName = 'Student User';
    authUin = '000000001';
  } else if (req.cookies.pl_test_user === 'test_instructor') {
    authUid = 'instructor@illinois.edu';
    authName = 'Instructor User';
    authUin = '100000000';
  }

  let params = [authUid, authName, authUin, 'dev'];
  sqldb.call('users_select_or_insert', params, (err, result) => {
    if (ERR(err, next)) return;

    var tokenData = {
      user_id: result.rows[0].user_id,
      authn_provider_name: 'devMode',
    };
    var pl_authn = csrf.generateToken(tokenData, config.secretKey);
    res.cookie('pl_authn', pl_authn, {
      maxAge: config.authnCookieMaxAgeMilliseconds,
      httpOnly: true,
      secure: true,
    });
    var redirUrl = res.locals.homeUrl;
    if ('preAuthUrl' in req.cookies) {
      redirUrl = req.cookies.preAuthUrl;
      res.clearCookie('preAuthUrl');
    }
    res.redirect(redirUrl);
  });
});

module.exports = router;
