// @ts-check
const ERR = require('async-stacktrace');
const assert = require('assert');
const Sentry = require('@prairielearn/sentry');
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');

const authnLib = require('../../lib/authn');
const logger = require('../../lib/logger');
const config = require('../../lib/config');

const { OAuth2Client } = require('google-auth-library');

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    if (!config.hasOauth) throw new Error('Google login is not enabled');
    const code = req.query.code;
    if (code == null) {
      throw new Error('No "code" query parameter for authCallbackOAuth2');
    }
    // FIXME: should check req.query.state to avoid CSRF
    let oauth2Client, identity;
    oauth2Client = new OAuth2Client(
      config.googleClientId,
      config.googleClientSecret,
      config.googleRedirectUrl
    );

    logger.verbose('Got Google auth with code: ' + code);
    const token_response = await oauth2Client.getToken(code).catch((err) => {
      if (err?.response) {
        // This is probably a detailed error from the Google API client. We'll
        // pick off the useful bits and attach them to the Sentry scope so that
        // they'll be included with the error event.
        Sentry.configureScope((scope) => {
          scope.setContext('OAuth', {
            code: err.code,
            data: err.response.data,
          });
        });
      }
      throw err;
    });

    oauth2Client.setCredentials(token_response);
    const tokenInfo = await oauth2Client.getTokenInfo(
      oauth2Client.credentials.access_token
    );
    console.log(tokenInfo);
    logger.verbose('Got Google auth tokens: ' + JSON.stringify(tokens));
    // SHOULD RE REMOVED oauth2Client.credentials = tokens;
    // tokens.id_token is a JWT (JSON Web Token)
    // http://openid.net/specs/draft-jones-json-web-token-07.html
    // A JWT has the form HEADER.PAYLOAD.SIGNATURE
    // We get the PAYLOAD, un-base64, parse to JSON:
    const parts = tokens.id_token.split('.');
    identity = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    logger.verbose('Got Google auth identity: ' + JSON.stringify(identity));
    assert(identity.email);

    let authnParams = {
      uid: identity.email,
      name: identity.name || identity.email,
      uin: identity.sub,
      provider: 'Google',
    };
    await authnLib.loadUser(req, res, authnParams, {
      pl_authn_cookie: true,
      redirect: true,
    });
  })
);

module.exports = router;
