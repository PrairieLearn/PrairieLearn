// @ts-check
const express = require('express');
const { generateSignedToken } = require('@prairielearn/signed-token');
const { config } = require('../../lib/config');
const { shouldSecureCookie, setCookie } = require('../../lib/cookie');
const { clearCookie } = require('../../lib/cookie');

const router = express.Router();

router.get('/', function (req, res) {
  res.locals.passwordInvalid = 'pl_assessmentpw' in req.cookies;
  res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post('/', function (req, res) {
  var redirectUrl = req.cookies.pl_pw_origUrl ?? '/';
  var maxAge = 1000 * 60 * 60 * 12; // 12 hours

  var pwCookie = generateSignedToken({ password: req.body.password, maxAge }, config.secretKey);
  setCookie(res, ['pl_assessmentpw', 'pl2_assessmentpw'], pwCookie, {
    maxAge,
    httpOnly: true,
    secure: shouldSecureCookie(req),
  });
  clearCookie(res, ['pl_pw_origUrl', 'pl2_pw_original_url']);
  return res.redirect(redirectUrl);
});
module.exports = router;
