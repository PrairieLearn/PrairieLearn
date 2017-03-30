var ERR = require('async-stacktrace');
var hmacSha256 = require('crypto-js/hmac-sha256');

var config = require('../lib/config');
var error = require('../lib/error');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    res.locals.is_administrator = false;
    var authUid = null, authName = null, authUin = null;

    if (req.method === 'OPTIONS') {
        // don't authenticate for OPTIONS requests, as these are just for CORS
        next();
        return;
    }

    if (req.path === '/pl/webhooks/autograder') {
      // Webhook callbacks should not be authenticated
      // We still have to make sure these fields exist so that things further
      // down the middleware chain don't fail
      res.locals.authn_user = {
        user_id: null,
        uid: null,
      }
      next();
      return;
    }

    // bypass auth for local /pl/ serving
    if (config.authType === 'none') {
        authUid = 'dev@example.com';
        authName = 'Dev User';
        authUin = '123456789';

        if (req.cookies.pl_test_user == 'test_student') {
            authUid = 'student@example.com';
            authName = 'Student User';
            authUin = '314156295';
        }
    } else if (config.authType == 'x-trust-auth') {

        // first try for trusted data
        if (req.headers['x-trust-auth-uid']) authUid = req.headers['x-trust-auth-uid'];
        if (req.headers['x-trust-auth-name']) authName = req.headers['x-trust-auth-name'];
        if (req.headers['x-trust-auth-uin']) authUin = req.headers['x-trust-auth-uin'];

        // next try for signed data
        if (!authUid) {
            authDate = null, authSignature = null;
            if (req.headers['x-auth-uid']) authUid = req.headers['x-auth-uid'];
            if (req.headers['x-auth-name']) authName = req.headers['x-auth-name'];
            if (req.headers['x-auth-date']) authDate = req.headers['x-auth-date'];
            if (req.headers['x-auth-signature']) authSignature = req.headers['x-auth-signature'];
            if (authUid) {
                var checkData = authUid + "/" + authName + "/" + authDate;
                var checkSignature = hmacSha256(checkData, config.secretKey).toString();
                if (authSignature !== checkSignature) return next(error.make(403, "Invalid X-Auth-Signature for " + authUid));
            }
        }

        if (!authUid) return next(error.make(403, "Unable to determine authUid", {path: req.path}));
    } else {
        return next(error.make(500, "Invalid authType: " + config.authType));
    }

    // catch bad Shibboleth data
    if (authUid == '(null)') {
        return next(error.make(400, 'Invalid authentication', {info: '(null) authUid', headers: req.headers}));
    }

    var params = {
        uid: authUid,
    };
    sqldb.query(sql.get_user, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) {
            // the user doesn't exist so try to make it
            // we need a name and UIN to do this
            if (!authName) {
                return next(error.make(400, 'Name not specified for new user', {authUid: authUid}));
            }
            if (!authUin) {
                return next(error.make(400, 'UIN not specified for new user', {authUid: authUid}));
            }
            var params = {
                uid: authUid,
                name: authName,
                uin: authUin,
            };
            sqldb.queryZeroOrOneRow(sql.insert_user, params, function(err, result) {
                if (ERR(err, next)) return;
                if (result.rowCount == 0) return next(new Error('Error creating new user', {params}));
                res.locals.authn_user = result.rows[0];
                res.locals.is_administrator = false;
                next();
            });
        } else {
            res.locals.authn_user = result.rows[0].user;
            res.locals.is_administrator = result.rows[0].is_administrator;
            // if we don't have a name or UIN then there is nothing left to do
            if (!authName && !authUin) return next();
            // if the name is correct then we are done
            if (res.locals.authn_user.name == authName && res.locals.authn_user.uin == authUin) return next();
            // authName or authUin differs from stored values, so update the DB
            var params = {
                user_id: res.locals.authn_user.user_id,
                name: authName || res.locals.authn_user.name,
                uin: authUin || res.locals.authn_user.uin,
            };
            sqldb.queryZeroOrOneRow(sql.update_user, params, function(err, result) {
                if (ERR(err, next)) return;
                if (result.rowCount == 0) return next(new Error('Error updating user data', {params}));
                res.locals.authn_user = result.rows[0];
                next();
            });
        }
    });
};
