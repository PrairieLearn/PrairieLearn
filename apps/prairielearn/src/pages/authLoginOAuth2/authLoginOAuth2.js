// @ts-check
const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const { logger } = require('@prairielearn/logger');
const { config } = require('../../lib/config');

const { OAuth2Client } = require('google-auth-library');

router.get('/', function (req, res, next) {
  if (
    !config.hasOauth ||
    !config.googleClientId ||
    !config.googleClientSecret ||
    !config.googleRedirectUrl
  ) {
    return next(new Error('Google login is not enabled'));
  }

  let url;
  try {
    const oauth2Client = new OAuth2Client(
      config.googleClientId,
      config.googleClientSecret,
      config.googleRedirectUrl
    );
    const scopes = ['openid', 'profile', 'email'];
    url = oauth2Client.generateAuthUrl({
      access_type: 'online',
      scope: scopes,
      prompt: 'select_account',
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
