var ERR = require('async-stacktrace');
const async = require('async');

var config = require('../lib/config');
var csrf = require('../lib/csrf');
var sqldb = require('../prairielib/lib/sql-db');
var sqlLoader = require('../prairielib/lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

const UUID_REGEXP = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

module.exports = function (req, res, next) {
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

    const uid = `loadtest+${uuid}@prairielearn.com`;
    const uin = `loadtest+${uuid}`;
    const name = `Load Test ${uuid}`;
    const authnProviderName = 'LoadTest';

    async.series(
      [
        async () => {
          const result = await sqldb.callAsync('users_select_or_insert', [
            uid,
            name,
            uin,
            authnProviderName,
          ]);
          const userResult = await sqldb.queryOneRowAsync(sql.select_user, {
            user_id: result.rows[0].user_id,
          });
          res.locals.authn_user = userResult.rows[0].user;
          res.locals.authn_institution = userResult.rows[0].institution;
          res.locals.authn_provider_name = 'LoadTest';
          res.locals.authn_is_administrator = userResult.rows[0].is_administrator;
          checkAdministratorAccess(req, res);

          // Enroll the load test user in the example course.
          await sqldb.queryAsync(sql.enroll_user_in_example_course, {
            user_id: result.rows[0].user_id,
          });
        },
      ],
      (err) => {
        if (ERR(err, next)) return;
        return next();
      }
    );

    return;
  }

  // bypass auth for local /pl/ serving
  // keeping for automated testing, see pages/authLoginDev for another way to dev signin
  if (config.authType === 'none') {
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

      let params = {
        user_id: result.rows[0].user_id,
      };
      sqldb.query(sql.select_user, params, (err, result) => {
        if (ERR(err, next)) return;
        if (result.rowCount === 0) {
          return next(new Error('user not found with user_id ' + authnData.user_id));
        }
        res.locals.authn_user = result.rows[0].user;
        res.locals.authn_institution = result.rows[0].institution;
        res.locals.authn_provider_name = 'Local';
        res.locals.authn_is_administrator = result.rows[0].is_administrator;
        res.locals.authn_is_instructor = result.rows[0].is_instructor;
        checkAdministratorAccess(req, res);
        res.locals.news_item_notification_count = result.rows[0].news_item_notification_count;
        next();
      });
    });
    return;
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

  let params = {
    user_id: authnData.user_id,
  };
  sqldb.query(sql.select_user, params, (err, result) => {
    if (ERR(err, next)) return;
    if (result.rowCount === 0) {
      return next(new Error('user not found with user_id ' + authnData.user_id));
    }
    res.locals.authn_user = result.rows[0].user;
    res.locals.authn_institution = result.rows[0].institution;
    res.locals.authn_provider_name = authnData.authn_provider_name;
    res.locals.authn_is_administrator = result.rows[0].is_administrator;
    res.locals.authn_is_instructor = result.rows[0].is_instructor;
    checkAdministratorAccess(req, res);
    res.locals.news_item_notification_count = result.rows[0].news_item_notification_count;

    // reset cookie timeout (#2268)
    var tokenData = {
      user_id: authnData.user_id,
      authn_provider_name: authnData.authn_provider_name || null,
    };
    var pl_authn = csrf.generateToken(tokenData, config.secretKey);
    res.cookie('pl_authn', pl_authn, {
      maxAge: config.authnCookieMaxAgeMilliseconds,
      httpOnly: true,
      secure: true,
    });

    next();
  });
};

function checkAdministratorAccess(req, res) {
  const defaultAccessType = res.locals.devMode ? 'active' : 'inactive';
  const accessType = req.cookies.pl_access_as_administrator || defaultAccessType;
  res.locals.access_as_administrator = accessType === 'active';
  res.locals.is_administrator =
    res.locals.authn_is_administrator && res.locals.access_as_administrator;
}
