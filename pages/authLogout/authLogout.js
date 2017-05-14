var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var logger = require('../../lib/logger');
var config = require('../../lib/config');

router.get('/', function(req, res, next) {
    res.clearCookie('pl_authn');
    if (res.locals.authn_user.provider == 'shibboleth') {
        res.redirect('/Shibboleth.sso/Logout');
    } else {
        res.redirect('/');
    }
});

module.exports = router;
