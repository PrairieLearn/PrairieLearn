// @ts-check
const ERR = require('async-stacktrace');
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const { logger } = require('@prairielearn/logger');
const error = require('@prairielearn/error');

const { config } = require('../../lib/config');

const router = express.Router();

router.get('/', function (req, res, next) {
  if (
    !config.hasOauth ||
    !config.googleClientId ||
    !config.googleClientSecret ||
    !config.googleRedirectUrl
  ) {
    return next(error.make(404, 'Google login is not enabled'));
  }

  let url;
  try {
    const oauth2Client = new OAuth2Client(
      config.googleClientId,
      config.googleClientSecret,
      config.googleRedirectUrl,
    );
    url = oauth2Client.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'profile', 'email'],
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
