const passport = require('passport');
const express = require('express');

const router = express.Router({ mergeParams: true });

router.get('/', function (req, res, next) {
  // TODO: enable based on config.
  const authData = {
    response: res,
    failureRedirect: '/pl',
    session: false,
  };
  passport.authenticate('saml', authData)(req, res, next);
});

module.exports = router;
