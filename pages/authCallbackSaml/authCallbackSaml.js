const asyncHandler = require('express-async-handler');
const express = require('express');
const passport = require('passport');

const router = express.Router({ mergeParams: true });

router.post(
  '/',
  asyncHandler(async (req, res) => {
    console.log('AUTH CALLBACK SAML');
    const authData = {
      response: res,
      failureRedirect: '/pl',
      session: false,
    };
    passport.authenticate('saml', authData)(req, res, (...args) => {
      console.log(args);

      let redirUrl = res.locals.homeUrl;
      if ('preAuthUrl' in req.cookies) {
        redirUrl = req.cookies.preAuthUrl;
        res.clearCookie('preAuthUrl');
      }
      res.redirect(redirUrl);
    });
  })
);

module.exports = router;
