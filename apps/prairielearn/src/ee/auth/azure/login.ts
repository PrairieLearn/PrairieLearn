import passport = require('passport');
import express = require('express');

const router = express.Router();

router.get(
  '/',
  function (req, res, next) {
    passport.authenticate('azuread-openidconnect', {
      failureRedirect: '/pl',
      session: false,
    })(req, res, next);
  },
  function (req, res) {
    res.redirect('/pl');
  }
);

export default router;
