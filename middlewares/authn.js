// @ts-check
const asyncHandler = require('express-async-handler');

const { config } = require('../lib/config');
const csrf = require('../lib/csrf');
const sqldb = require('@prairielearn/postgres');
const authnLib = require('../lib/authn');

const sql = sqldb.loadSqlEquiv(__filename);

const UUID_REGEXP = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

module.exports = asyncHandler(async (req, res, next) => {
  res.locals.is_administrator = false;
  res.locals.news_item_notification_count = 0;

  if (req.method === 'OPTIONS') {
    // don't authenticate for OPTIONS requests, as these are just for CORS
    next();
    return;
  }

  if (/^\/pl\/webhooks\//.test(req.path)) {
    // Webhook callbacks should not be authenticated
    next();
    return;
  }

  if (/^\/pl\/api\//.test(req.path)) {
    // API calls will be authenticated outside this normal flow using tokens
    next();
    return;
  }

  // look for load-testing override cookie
  if (req.cookies.load_test_token) {
    const data = csrf.getCheckedData(req.cookies.load_test_token, config.secretKey, {
      maxAge: 24 * 60 * 60 * 1000,
    });

    if (!data || !data.uuid || typeof data.uuid !== 'string' || !data.uuid.match(UUID_REGEXP)) {
      return next(new Error('invalid load_test_token'));
    }

    const uuid = data.uuid;

    let authnParams = {
      uid: `loadtest+${uuid}@prairielearn.com`,
      uin: `loadtest+${uuid}`,
      name: `Load Test ${uuid}`,
      provider: 'LoadTest',
    };

    await authnLib.loadUser(req, res, authnParams, {
      pl_authn_cookie: false,
      redirect: false,
    });

    // Enroll the load test user in the example course.
    await sqldb.queryAsync(sql.enroll_user_in_example_course, {
      user_id: res.locals.authn_user.user_id,
    });

    return next();
  }

  // Allow auth to be bypassed for local dev mode; also used for tests.
  // See `pages/authLoginDev` for cookie-based authentication in dev mode.
  if (config.authType === 'none') {
    var uid = config.authUid;
    var name = config.authName;
    var uin = config.authUin;

    // We allow unit tests to override the user. Unit tests may also override the req_date
    // (middlewares/date.js) and the req_mode (middlewares/authzCourseOrInstance.js).

    if (req.cookies.pl_test_user === 'test_student') {
      uid = 'student@illinois.edu';
      name = 'Student User';
      uin = '000000001';
    } else if (req.cookies.pl_test_user === 'test_instructor') {
      uid = 'instructor@illinois.edu';
      name = 'Instructor User';
      uin = '100000000';
    }

    if (!uid) throw new Error('Missing uid');

    let authnParams = {
      uid,
      uin,
      name,
      provider: 'dev',
    };

    await authnLib.loadUser(req, res, authnParams, {
      redirect: false,
      pl_authn_cookie: false,
    });
    return next();
  }

  var authnData = null;
  if (req.cookies.pl_authn) {
    // if we have a authn cookie then we try and unpack it
    authnData = csrf.getCheckedData(req.cookies.pl_authn, config.secretKey, {
      maxAge: config.authnCookieMaxAgeMilliseconds,
    });
    // if the cookie unpacking failed then authnData will be null
  }
  if (authnData == null) {
    // we failed to authenticate
    if (/^(\/?)$|^(\/pl\/?)$/.test(req.path)) {
      // the requested path is the homepage, so allow this request to proceed without an authenticated user
      next();
      return;
    } else {
      // we aren't authenticated, and we've requested some page that isn't the homepage, so bounce to the login page
      // first set the preAuthUrl cookie for redirection after authn
      res.cookie('preAuthUrl', req.originalUrl);
      // clear the pl_authn cookie in case it was bad
      res.clearCookie('pl_authn');

      // If we're in the middle of a PrairieTest login flow, propagate that to
      // the login page so we can show a message to the user.
      let query = '';
      if (req.path === '/pl/prairietest/auth') {
        query = '?service=PrairieTest';
      }
      res.redirect(`/pl/login${query}`);
      return;
    }
  }

  let authnParams = {
    user_id: authnData.user_id,
    provider: authnData.authn_provider_name,
  };
  await authnLib.loadUser(req, res, authnParams, {
    redirect: false,
    // Cookie is being set here again to reset the cookie timeout (#2268)
    pl_authn_cookie: true,
  });

  return next();
});
