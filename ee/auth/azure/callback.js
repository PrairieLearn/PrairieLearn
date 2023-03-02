// @ts-check
const passport = require('passport');
const express = require('express');
const asyncHandler = require('express-async-handler');
const util = require('util');

const authnLib = require('../../../lib/authn');

const router = express.Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    // This will write the resolved user to `req.user`.
    await util.promisify(
      passport.authenticate('azuread-openidconnect', {
        failureRedirect: '/pl',
        session: false,
      })
    )(req, res);

    const user = req.user;
    if (!user) throw new Error('Login failed');

    const authnParams = {
      // @ts-expect-error `upn` is not defined on the type.
      uid: user.upn,
      // @ts-expect-error `displayName` is not defined on the type.
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
