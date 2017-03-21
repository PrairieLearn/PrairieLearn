var ERR = require('async-stacktrace');
var _ = require('lodash');

var config = require('../lib/config');
var error = require('../lib/error');
var csrf = require('../lib/csrf');

module.exports = function(req, res, next) {
    // We need to disable CSRF checking for webhooks
    // TODO write custom middleware to let us disable CSRF checking per-route
    // in a more configurable manner?
    if (req.path === '/pl/webhooks/autograder') {
        return next()
    }

    var tokenData = {
        url: req.originalUrl,
        authn_user_id: res.locals.authn_user.user_id,
    };
    res.locals.csrfToken = csrf.generateToken(tokenData, config.secretKey);

    if (req.method == "POST") {
        if (!csrf.checkToken(req.body.csrfToken, tokenData, config.secretKey)) {
            return next(error.make(403, 'CSRF fail', res.locals));
        }
    }
    next();
};
