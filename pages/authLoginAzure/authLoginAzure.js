var ERR = require('async-stacktrace');
var passport = require('passport');
var express = require('express');
var router = express.Router();

var logger = require('../../lib/logger');
var config = require('../../lib/config');

router.get('/', function(req, res, next) {
    const authData = {
        response: res,
        failureRedirect: '/pl',
        session: false,
    };
    passport.authenticate('azuread-openidconnect', authData)(req, res, next);
}, function(req, res) {
    res.redirect('/pl');
});

module.exports = router;
