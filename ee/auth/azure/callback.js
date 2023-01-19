var ERR = require('async-stacktrace');
var passport = require('passport');
var express = require('express');
var router = express.Router();

var config = require('../../../lib/config');
var csrf = require('../../../lib/csrf');
var sqldb = require('../../../prairielib/lib/sql-db');

router.post('/', function (req, res, next) {
  const authData = {
    response: res,
    failureRedirect: '/pl',
    session: false,
  };
  passport.authenticate('azuread-openidconnect', authData, function (err, user, _info) {
    if (ERR(err, next)) return;
    if (!user) return next(new Error('Login failed'));

    var params = [
      user.upn, // uid
      user.displayName, // name
      null, // uin
      'Azure', // provider
    ];
    sqldb.call('users_select_or_insert', params, (err, result) => {
      if (ERR(err, next)) return;
      var tokenData = {
        user_id: result.rows[0].user_id,
        authn_provider_name: 'Azure',
      };
      var pl_authn = csrf.generateToken(tokenData, config.secretKey);
      res.cookie('pl_authn', pl_authn, {
        maxAge: config.authnCookieMaxAgeMilliseconds,
        httpOnly: true,
        secure: true,
      });
      var redirUrl = res.locals.homeUrl;
      if ('preAuthUrl' in req.cookies) {
        redirUrl = req.cookies.preAuthUrl;
        res.clearCookie('preAuthUrl');
      }
      res.redirect(redirUrl);
    });
  })(req, res, next);
});

module.exports = router;
