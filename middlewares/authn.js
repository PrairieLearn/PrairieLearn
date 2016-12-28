var ERR = require('async-stacktrace');
var hmacSha256 = require('crypto-js/hmac-sha256');

var config = require('../lib/config');
var error = require('../lib/error');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var authUid = null, authName = null;

    if (req.method === 'OPTIONS') {
        // don't authenticate for OPTIONS requests, as these are just for CORS
        next();
        return;
    }

    // bypass auth for local /pl/ serving
    if (config.authType === 'none') {
        authUid = 'user1@illinois.edu';
        authName = 'Test User';
    } else if (config.authType == 'x-trust-auth') {

        // first try for trusted data
        if (req.headers['x-trust-auth-uid']) authUid = req.headers['x-trust-auth-uid'];
        if (req.headers['x-trust-auth-name']) authName = req.headers['x-trust-auth-name'];

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

    var params = {
        uid: authUid,
    };
    sqldb.query(sql.get, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) {
            // the user doesn't exist so try to make it
            // we need a name to do this
            if (!authName) {
                return next(error.make(400, 'Name not specified for new user', {authUid: authUid}));
            }
        } else {
            res.locals.authn_user = result.rows[0];
            // if we don't have a name then there is nothing left to do
            if (!authName) return next();
            // if the name is correct then we are done
            if (res.locals.authn_user.name == authName) return next();
        }

        // we either don't have the user or the name is incorrect
        var params = {
            uid: authUid,
            name: authName,
        };
        sqldb.queryOneRow(sql.set, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.authn_user = result.rows[0];
            next();
        });
    });
};
