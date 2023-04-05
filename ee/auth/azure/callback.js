// @ts-check
const passport = require('passport');
const express = require('express');
const asyncHandler = require('express-async-handler');

const authnLib = require('../../../lib/authn');

const router = express.Router();

function authenticate(req, res) {
  return new Promise((resolve, reject) => {
    passport.authenticate(
      'azuread-openidconnect',
      {
        failureRedirect: '/pl',
        session: false,
      },
      (err, user) => {
        if (err) {
          reject(err);
        } else if (!user) {
          reject(new Error('Login failed'));
        } else {
          resolve(user);
        }
      }
    )(req, res);
  });
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const user = await authenticate(req, res);

    const authnParams = {
      uid: user.upn,
      name: user.displayName,
      uin: null,
      provider: 'Azure',
    };

    await authnLib.loadUser(req, res, authnParams, {
      redirect: true,
      pl_authn_cookie: true,
    });
  })
);

module.exports = router;
