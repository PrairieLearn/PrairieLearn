const ERR = require('async-stacktrace');

const config = require('../lib/config');
const csrf = require('../lib/csrf');
const authLib = require('../lib/auth');
const { sqldb, sqlLoader } = require('@prairielearn/prairielib');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
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
        if (!csrf.checkToken(req.cookies.load_test_token, 'load_test', config.secretKey, {maxAge: 24 * 60 * 60 * 1000})) {
            return next(new Error('invalid load_test_token'));
        }

        let params = {
            uid: 'loadtest@prairielearn.org',
            name: 'Load Test',
            uin: '999999999',
            provider: 'LoadTest',
        };

        authLib.set_pl_authn(res, params, (err, user, authnToken) => {
            if (ERR(err, next)) return;
            authLib.set_locals_authn(res, user, authnToken);
            let params = {
                uid: 'loadtest@prairielearn.org',
                course_short_name: 'XC 101',
            };
            sqldb.query(sql.enroll_user_as_instructor, params, (err, _result) => {
                if (ERR(err, next)) return;
                next();
            });
        });
        return;
    }

    // if no auth cookie is found
    if (req.cookies.pl_authn == null) {

        // bypass auth for local /pl/ serving
        if (config.authType === 'none') {
            return authLib.devmodeLogin(req, res, (err, _dbUser, _authnData) => {
                if (ERR(err, next)) return;
                next();
            });
        }

        // if no authn cookie then redirect to the login page
        res.cookie('preAuthUrl', req.originalUrl);
        res.redirect('/pl/login');
        return;
    }

    // Validate auth cookie
    var authnData = csrf.getCheckedData(req.cookies.pl_authn, config.secretKey, {maxAge: 24 * 60 * 60 * 1000});
    if (authnData == null || authnData.authn_provider_name == null) { // force re-authn if authn_provider_name is missing (for upgrade)
        // if authn cookie check failed then clear the cookie and redirect to login
        res.clearCookie('pl_authn');
        res.redirect('/pl/login');
        return;
    }

    // Get authn data from database, put in res.locals
    authLib.set_locals_authn(res, authnData, next);
};
