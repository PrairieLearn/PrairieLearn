var express = require('express');
var router = express.Router();

router.get('/', function (req, res, _next) {
  res.clearCookie('pl_authn');
  res.clearCookie('pl_assessmentpw');
  if (res.locals.authn_provider_name === 'Shibboleth') {
    res.redirect('/Shibboleth.sso/Logout');
  } else {
    res.redirect('/');
  }
});

module.exports = router;
