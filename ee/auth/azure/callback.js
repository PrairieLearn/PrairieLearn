var ERR = require('async-stacktrace');
var passport = require('passport');
var express = require('express');
var router = express.Router();
const asyncHandler = require('express-async-handler');

const authnLib = require('../../../lib/authn');


router.post('/', asyncHandler(async (req, res, next) => {
  const authData = {
    response: res,
    failureRedirect: '/pl',
    session: false,
  };
  passport.authenticate('azuread-openidconnect', authData, async (err, user, _info) => {
    if (ERR(err, next)) return;
    if (!user) return next(new Error('Login failed'));

    let authnParams = {
      authnUid: user.upn,
      authnName: user.displayName,
      authnUin: null,
    };

    await authnLib.load_user_profile(req, res, authnParams, 'Azure' {
      redirect: true,
      pl_authn_cookie: true,
    });
  })(req, res, next);
}));

module.exports = router;
