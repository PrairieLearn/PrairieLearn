var ERR = require('async-stacktrace');
var _ = require('lodash');

var config = require('../lib/config');
var error = require('../lib/error');
var csrf = require('../lib/csrf');

module.exports = function(req, res, next) {
    var tokenData = {
        url: req.originalUrl,
        authn_user_id: res.locals.authn_user ? res.locals.authn_user.user_id : undefined,
    };
    res.locals.csrfToken = csrf.generateToken(tokenData, config.secretKey);

    if (req.method == "POST") {
        if (!csrf.checkToken(req.body.csrfToken, tokenData, config.secretKey)) {
            return next(error.make(403, 'CSRF fail', res.locals));
        }
    }
    next();
};
