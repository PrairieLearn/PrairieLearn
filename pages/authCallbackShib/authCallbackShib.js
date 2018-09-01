var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var config = require('../../lib/config');
var csrf = require('../../lib/csrf');
var sqldb = require('@prairielearn/prairielib/sql-db');

router.get('/:action?/:target(*)?', function(req, res, next) {
    if (!config.hasShib) return next(new Error('Illinois Shibboleth login is not enabled'));
    var authUid = null;
    var authName = null;
    var authUin = null;
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
            user_id: result.rows[0].user_id,
        };
        var pl_authn = csrf.generateToken(tokenData, config.secretKey);
        res.cookie('pl_authn', pl_authn, {maxAge: 24 * 60 * 60 * 1000});
        if (req.params.action == 'redirect') return res.redirect('/' + req.params.target);
        var redirUrl = res.locals.homeUrl;
        if ('preAuthUrl' in req.cookies) {
            redirUrl = req.cookies.preAuthUrl;
            res.clearCookie('preAuthUrl');
        }
        res.redirect(redirUrl);
    });
});

module.exports = router;
