var config = require('../lib/config');
var error = require('../lib/error');
var csrf = require('../lib/csrf');

module.exports = function(req, res, next) {
    var tokenData = {
        url: req.originalUrl,
    };
    if (res.locals.authn_user && res.locals.authn_user.user_id) {
        tokenData.authn_user_id = res.locals.authn_user.user_id;
    }
    res.locals.csrfToken = csrf.generateToken(tokenData, config.secretKey);

    if (req.method == 'POST') {
        var csrfToken = req.headers['x-csrf-token'] ? req.headers['x-csrf-token'] : req.body.csrfToken;
        if (!csrf.checkToken(csrfToken, tokenData, config.secretKey)) {
            return next(error.make(403, 'CSRF fail', res.locals));
        }
    }
    next();
};
