const express = require('express');
const { generateSignedToken } = require('@prairielearn/signed-token');
const { config } = require('../../lib/config');
const { shouldSecureCookie } = require('../../lib/cookie');

const router = express.Router();

router.get('/', function (req, res) {
  res.locals.passwordInvalid = 'pl2_assessmentpw' in req.cookies;
  res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post('/', function (req, res) {
  var redirectUrl = req.cookies.pl2_pw_original_url ?? '/';
  var maxAge = 1000 * 60 * 60 * 12; // 12 hours

  var pwCookie = generateSignedToken({ password: req.body.password, maxAge }, config.secretKey);
  res.cookie('pl2_assessmentpw', pwCookie, {
    maxAge,
    httpOnly: true,
    secure: shouldSecureCookie(req),
    domain: config.cookieDomain,
  });
  res.clearCookie('pl_pw_origUrl');
  res.clearCookie('pl_pw_origUrl', { domain: config.cookieDomain });
  res.clearCookie('pl2_pw_original_url');
  res.clearCookie('pl2_pw_original_url', { domain: config.cookieDomain });
  return res.redirect(redirectUrl);
});
module.exports = router;
