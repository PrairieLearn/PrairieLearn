var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var logger = require('../../lib/logger');
var config = require('../../lib/config');

var OIDCStrategy = require('passport-azure-ad').OIDCStrategy;

const azureConfig = {
    identityMetadata: config.azureIdentityMetadata,
    clientID: config.azureClientID,
    responseType: config.azureResponseType,
    responseMode: config.azureResponseMode,
    redirectUrl: config.azureRedirectUrl,
    allowHttpForRedirectUrl: config.azureAllowHttpForRedirectUrl,
    clientSecret: config.azureClientSecret,
    validateIssuer: config.azureValidateIssuer,
    isB2C: config.azureIsB2C,
    issuer: config.azureIssuer,
    passReqToCallback: config.azurePassReqToCallback,
    scope: config.azureScope,
    loggingLevel: config.azureLoggingLevel,
    nonceLifetime: config.azureNonceLifetime,
    nonceMaxAmount: config.azureNonceMaxAmount,
    useCookieInsteadOfSession: config.azureUseCookieInsteadOfSession,
    cookieEncryptionKeys: config.azureCookieEncryptionKeys,
    clockSkew: config.azureClockSkew,
};

passport.use(new OIDCStrategy(azureConfig, function(iss, sub, profile, accessToken, refreshToken, done) {return done(null, profile);}));

app.get('/', function(req, res, next) {
    const authData = {
        response: res,
        failureRedirect: '/pl',
    };
    passport.authenticate('azuread-openidconnect', authData)(req, res, next);
}, function(req, res) {
    res.redirect('/pl');
});

module.exports = router;
