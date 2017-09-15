var ERR = require('async-stacktrace');
var passport = require('passport');
var express = require('express');
var router = express.Router();

var logger = require('../../lib/logger');
var config = require('../../lib/config');
var csrf = require('../../lib/csrf');
var sqldb = require('../../lib/sqldb');

// FIXME: do we need "all" below for both "get" and "post", or just one of them?
router.all('/', function(req, res, next) {
    const authData = {
        response: res,
        failureRedirect: '/pl',
        session: false,
    };
    passport.authenticate('azuread-openidconnect', authData, function(err, user, info) {
        if (ERR(err, next)) return;
        if (!user) return next(new Error('Login failed'));

        console.log('user', user, 'info', info);
        logger.info({user, info});
        var params = [
            user.upn,         // uid
            user.displayName, // name
            null,             // uin
            'azure',          // provider
        ];
        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, next)) return;
            var tokenData = {
                user_id: result.rows[0].user_id
            };
            var pl_authn = csrf.generateToken(tokenData, config.secretKey);
            res.cookie('pl_authn', pl_authn, {maxAge: 24 * 60 * 60 * 1000});
            res.redirect(res.locals.plainUrlPrefix);
        });
    })(req, res, next);
});

module.exports = router;
