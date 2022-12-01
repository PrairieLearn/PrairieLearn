// @ts-check
const passport = require('passport');
const express = require('express');
const router = express.Router();

router.get(
  '/',
  function (req, res, next) {
    const authData = {
      response: res,
      failureRedirect: '/pl',
      session: false,
    };
    passport.authenticate('azuread-openidconnect', authData)(req, res, next);
  },
  function (req, res) {
    res.redirect('/pl');
  }
);

module.exports = router;
