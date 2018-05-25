const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const logger = require('../../lib/logger');
const config = require('../../lib/config');

const {google} = require('googleapis');
const OAuth2 = google.auth.OAuth2;

router.get('/', function(req, res, next) {
    try {
        const oauth2Client = OAuth2(
            config.googleClientId,
            config.googleClientSecret,
            config.googleRedirectUrl
        );
        const scopes = [
            'openid',
            'profile',
            'email',
        ];
        const url = oauth2Client.generateAuthUrl({
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
