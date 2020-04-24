const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const config = require('../../lib/config');
const authLib = require('../../lib/auth');

router.get('/', function(req, res, next) {
    if (!config.hasShib) return next(new Error('Shibboleth login is not enabled'));
    var authUid = null;
    var authName = null;
    var authUin = null;
    if (req.headers['x-trust-auth-uid']) authUid = req.headers['x-trust-auth-uid'];
    if (req.headers['x-trust-auth-name']) authName = req.headers['x-trust-auth-name'];
    if (req.headers['x-trust-auth-uin']) authUin = req.headers['x-trust-auth-uin'];
    if (!authUid) return next(new Error('No authUid'));

    // catch bad Shibboleth data
    const authError = 'Your account is not registered for this service. Please contact your course instructor or IT support.';
    if (authUid == '(null)') return next(new Error(authError));

    const params = {
        uid: authUid,
        name: authName,
        uin: authUin,
        provider: 'Shibboleth',
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
});

module.exports = router;
