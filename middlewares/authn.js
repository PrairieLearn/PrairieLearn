var ERR = require('async-stacktrace');

var config = require('../lib/config');
var csrf = require('../lib/csrf');
var logger = require('../lib/logger');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    res.locals.is_administrator = false;

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
            provider: 'dev',
        };
        sqldb.queryOneRow(sql.insert_user, params, (err, result) => {
            if (ERR(err, next)) return;
            res.locals.authn_user = result.rows[0].user;
            res.locals.is_administrator = result.rows[0].is_administrator;

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

    // bypass auth for local /pl/ serving
    if (config.authType === 'none') {
        var authUid = 'dev@illinois.edu';
        var authName = 'Dev User';
        var authUin = '000000000';

        if (req.cookies.pl_test_user == 'test_student') {
            authUid = 'student@illinois.edu';
            authName = 'Student User';
            authUin = '000000001';
        }
        let params = {
            uid: authUid,
            name: authName,
            uin: authUin,
            provider: 'dev',
        };
        sqldb.queryOneRow(sql.insert_user, params, (err, result) => {
            if (ERR(err, next)) return;
            res.locals.authn_user = result.rows[0].user;
            res.locals.is_administrator = result.rows[0].is_administrator;
            next();
        });
        return;
    }

    // otherwise look for auth cookies
    if (req.cookies.pl_authn == null) {
        // if no authn cookie then redirect to the login page
        res.cookie('preAuthUrl', req.originalUrl);
        res.redirect('/pl/login');
        return;
    }
    var authnData = csrf.getCheckedData(req.cookies.pl_authn, config.secretKey, {maxAge: 24 * 60 * 60 * 1000});
    if (authnData == null) {
        // if CSRF checking failed then clear the cookie and redirect to login
        logger.error('authn cookie CSRF failure');
        res.clearCookie('pl_authn');
        res.redirect('/pl/login');
        return;
    }

    let params = {
        user_id: authnData.user_id,
    };
    sqldb.query(sql.select_user, params, (err, result) => {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) return next(new Error('user not found with user_id ' + authnData.user_id));
        res.locals.authn_user = result.rows[0].user;
        res.locals.is_administrator = result.rows[0].is_administrator;
        next();
    });
};
