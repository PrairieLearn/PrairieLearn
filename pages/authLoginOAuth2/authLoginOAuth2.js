var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var logger = require('../../lib/logger');
var error = require('../../lib/config');
var csrf = require('../../lib/csrf');

var google = require('googleapis');
var OAuth2 = google.auth.OAuth2;

router.get('/', function(req, res, next) {
    try {
        var oauth2Client = new OAuth2(
            config.googleClientId,
            config.googleClientSecret,
            config.googleRedirectUrl,
        );
        var scopes = [
            'openid',
            'profile',
            'email',
        ];
        var url = oauth2Client.generateAuthUrl({
            access_type: 'online',
            scope: scopes,
            // FIXME: should add some state here to avoid CSRF
        });
    } catch (err) {
        ERR(err, next);
        return;
    }
    logger.verbose('Google auth URL redirect: ' + url);
    res.redirect(url);
});

module.exports = router;
