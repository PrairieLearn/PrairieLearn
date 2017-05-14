var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var logger = require('../../lib/logger');
var error = require('../../lib/config');

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
            config.googleRedirectUrl,
        );
    } catch(err) {
        ERR(err, next);
        return;
    }
    logger.verbose('Got Google auth with code: ' + code);
    oauth2Client.getToken(code, function (err, tokens) {
        if (ERR(err, next)) return;
        logger.verbose('Got Google auth tokens: ' + JSON.stringify(tokens));
        oauth2Client.setCredentials(tokens);
        next(new Error(JSON.stringify(tokens)));
    });
});

module.exports = router;
