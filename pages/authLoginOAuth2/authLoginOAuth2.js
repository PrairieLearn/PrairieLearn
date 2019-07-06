const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const logger = require('../../lib/logger');
const config = require('../../lib/config');

const {google} = require('googleapis');

router.get('/', function(req, res, next) {
    if (!config.hasOauth) return next(new Error('Google login is not enabled'));
    let url;
    try {
        const oauth2Client = new google.auth.OAuth2(
            config.googleClientId,
            config.googleClientSecret,
            config.googleRedirectUrl
        );
        const scopes = [
            'openid',
            'profile',
            'email',
        ];
        url = oauth2Client.generateAuthUrl({
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
