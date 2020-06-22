const ERR = require('async-stacktrace');
const passport = require('passport');
const express = require('express');
const router = express.Router();

const config = require('../../lib/config');
const authLib = require('../../lib/auth');

// FIXME: do we need "all" below for both "get" and "post", or just one of them?
router.all('/', function(req, res, next) {
    if (!config.hasAzure) return next(new Error('Microsoft login is not enabled'));
    const authData = {
        response: res,
        failureRedirect: '/pl',
        session: false,
    };
    passport.authenticate('azuread-openidconnect', authData, function(err, user, _info) {
        if (ERR(err, next)) return;
        if (!user) return next(new Error('Login failed'));

        var params = {
            uid: user.upn,
            name: user.displayName,
            uin: null,
            provider: 'Azure',
        };

        authLib.set_pl_authn(res, params, (err) => {
            if (ERR(err, next)) return;
            var redirUrl = res.locals.homeUrl;
            if ('preAuthUrl' in req.cookies) {
                redirUrl = req.cookies.preAuthUrl;
                res.clearCookie('preAuthUrl');
            }
            res.redirect(redirUrl);
        });
    })(req, res, next);
});

module.exports = router;
