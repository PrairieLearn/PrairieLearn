const passport = require('passport');
const express = require('express');
const router = express.Router();

const config = require('../../lib/config');

router.get('/', function(req, res, next) {
    if (!config.hasAzure) return next(new Error('Microsoft login is not enabled'));
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
