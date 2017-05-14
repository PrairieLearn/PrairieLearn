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

var google = require('googleapis');
var OAuth2 = google.auth.OAuth2;

router.get('/', function(req, res, next) {
    var code = req.query.code;
    if (code == null) {
        return next(new Error('No "code" query parameter for authCallbackOAuth2'));
    }
    // FIXME: should check req.query.state to avoid CSRF
    try {
        var oauth2Client = new OAuth2(
            config.googleClientId,
            config.googleClientSecret,
            config.googleRedirectUrl
        );
    } catch(err) {
        ERR(err, next);
        return;
    }
    logger.verbose('Got Google auth with code: ' + code);
    oauth2Client.getToken(code, function (err, tokens) {
        if (ERR(err, next)) return;
        try {
            logger.verbose('Got Google auth tokens: ' + JSON.stringify(tokens));
            oauth2Client.setCredentials(tokens);
            var parts = tokens.id_token.split('.');
            var identity = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
            logger.verbose('Got Google auth identity: ' + JSON.stringify(identity));
            assert(identity.email);
        } catch (err) {
            ERR(err, next);
            return;
        }
        var params = [
            email,    // uid
            email,    // name
            null,     // uin
            'google', //provider
        ];
        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, next)) return;
            var tokenData = {
                user_id: result.user_id
            }
            var pl_authn = csrf.generateToken(tokenData, config.secretKey);
            res.cookie('pl_authn', pl_authn, {maxAge: 24 * 60 * 60 * 1000});
            res.redirect(res.locals.plainUrlPrefix);
        });
    });
});

module.exports = router;
