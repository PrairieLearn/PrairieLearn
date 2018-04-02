var ERR = require('async-stacktrace');
var assert = require('assert');
var express = require('express');
var router = express.Router();

var logger = require('../../lib/logger');
var config = require('../../lib/config');
var csrf = require('../../lib/csrf');
var sqldb = require('@prairielearn/prairielib/sql-db');

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
            oauth2Client.credentials = tokens;
            // tokens.id_token is a JWT (JSON Web Token)
            // http://openid.net/specs/draft-jones-json-web-token-07.html
            // A JWT has the form HEADER.PAYLOAD.SIGNATURE
            // We get the PAYLOAD, un-base64, parse to JSON:
            var parts = tokens.id_token.split('.');
            var identity = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
            logger.verbose('Got Google auth identity: ' + JSON.stringify(identity));
            assert(identity.email);
        } catch (err) {
            ERR(err, next);
            return;
        }
        var params = [
            identity.email, // uid
            identity.email, // name
            null,           // uin
            'google',       // provider
        ];
        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, next)) return;
            var tokenData = {
                user_id: result.rows[0].user_id,
            };
            var pl_authn = csrf.generateToken(tokenData, config.secretKey);
            res.cookie('pl_authn', pl_authn, {maxAge: 24 * 60 * 60 * 1000});
            var redirUrl = res.locals.plainUrlPrefix;
            if ('preAuthUrl' in req.cookies) {
                redirUrl = req.cookies.preAuthUrl;
                res.clearCookie('preAuthUrl');
            }
            res.redirect(redirUrl);
        });
    });
});

module.exports = router;
