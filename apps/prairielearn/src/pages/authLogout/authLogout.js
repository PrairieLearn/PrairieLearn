// @ts-check
const express = require('express');

const { config } = require('../../lib/config');

const router = express.Router();

router.get('/', function (req, res, _next) {
  res.clearCookie('pl_authn');
  res.clearCookie('pl_assessmentpw');

  if (config.devMode) {
    // In dev mode, a user will typically by automatically authenticated by our
    // authentication middleware to reduce the friction of getting started.
    // However, folks who want to specifically test authentication behavior can
    // click "Log out". In this case, we want to disable the automatic login
    // until the next time the user authenticates.
    res.cookie('pl_disable_auto_authn', '1');
  }

  const redirect = req.query.redirect;
  if (redirect && typeof redirect === 'string') {
    res.redirect(decodeURIComponent(redirect));
  } else if (res.locals.authn_provider_name === 'Shibboleth') {
    res.redirect('/Shibboleth.sso/Logout');
  } else {
    res.redirect('/');
  }
});

module.exports = router;
