// @ts-check
const express = require('express');
const router = express.Router();

const passport = require('passport');

const { config } = require('../../lib/config');

router.get('/', 
  function (req, res, next) {
    if (!config.hasOid) {
      return next(new Error(`OID login is not enabled`));
    }
    
    passport.authenticate(
      'oidconnect',
      { failureRedirect: '/pl', session: false }
    )(req, res, next);
  }, function (req, res) {
    res.redirect('/pl');
  }
);

module.exports = router;
