const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const config = require('../../lib/config');
const csrf = require('../../lib/csrf');
const { sqldb } = require('@prairielearn/prairielib');

router.get('/', function(req, res, next) {
    if (!res.locals.devMode) return next(new Error('DevMode login is not enabled'));

    var authUid = 'dev@illinois.edu';
    var authName = 'Dev User';
    var authUin = '000000000';

    if (req.cookies.pl_test_user == 'test_student') {
        authUid = 'student@illinois.edu';
        authName = 'Student User';
        authUin = '000000001';
    }

    var params = [
        authUid,
        authName,
        authUin,
        'dev',
    ];
    sqldb.call('users_select_or_insert', params, (err, result) => {
        if (ERR(err, next)) return;
        var tokenData = {
            user_id: result.rows[0].user_id,
        };
        var pl_authn = csrf.generateToken(tokenData, config.secretKey);
        res.cookie('pl_authn', pl_authn, {maxAge: 24 * 60 * 60 * 1000});
        var redirUrl = res.locals.homeUrl;
        if ('preAuthUrl' in req.cookies) {
            redirUrl = req.cookies.preAuthUrl;
            res.clearCookie('preAuthUrl');
        }
        res.redirect(redirUrl);
    });
});

module.exports = router;
