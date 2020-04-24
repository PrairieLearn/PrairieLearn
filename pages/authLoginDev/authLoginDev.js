const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const authLib = require('../../lib/auth');

router.get('/', function(req, res, next) {
    if (!res.locals.devMode) return next(new Error('DevMode login is not enabled'));

    authLib.devmodeLogin(req, res, (err) => {
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
