var express = require('express');
var router = express.Router();

router.get('/', function(req, res, _next) {
    res.clearCookie('pl_authn');
    if (res.locals.authn_user.provider == 'shibboleth') {
        res.redirect('/Shibboleth.sso/Logout');
    } else {
        res.redirect('/');
    }
});

module.exports = router;
