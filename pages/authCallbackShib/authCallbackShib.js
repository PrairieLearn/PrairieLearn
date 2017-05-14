var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var logger = require('../../lib/logger');
var config = require('../../lib/config');
var csrf = require('../../lib/csrf');
var sqldb = require('../../lib/sqldb');

router.get('/', function(req, res, next) {
    var authUid = null. authName = null, authUin = null;
    if (req.headers['x-trust-auth-uid']) authUid = req.headers['x-trust-auth-uid'];
    if (req.headers['x-trust-auth-name']) authName = req.headers['x-trust-auth-name'];
    if (req.headers['x-trust-auth-uin']) authUin = req.headers['x-trust-auth-uin'];
    if (!authUid) return next(new Error('No authUid'));

    // catch bad Shibboleth data
    if (authUid == '(null)') return next(new Error('authUid is (null)'));
    
    var params = [
        authUid,
        authName,
        authUin,
        'shibboleth',
    ];
    sqldb.call('users_select_or_insert', params, (err, result) => {
        if (ERR(err, next)) return;
        var tokenData = {
            user_id: result.rows[0].user_id
        }
        var pl_authn = csrf.generateToken(tokenData, config.secretKey);
        res.cookie('pl_authn', pl_authn, {maxAge: 24 * 60 * 60 * 1000});
        res.redirect(res.locals.plainUrlPrefix);
    });
});

module.exports = router;
