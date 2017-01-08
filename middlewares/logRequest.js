var config = require('../lib/config');
var error = require('../lib/error');
var logger = require('../lib/logger');

module.exports = function(req, res, next) {
    if (req.method !== 'OPTIONS') {
        var access = {
            timestamp: (new Date()).toISOString(),
            ip: req.ip,
            forwardedIP: req.headers['x-forwarded-for'],
            authn_user_id: res.locals.authn_user.user_id,
            authn_user_uid: res.locals.authn_user.uid,
            method: req.method,
            path: req.path,
            params: req.params,
            body: req.body,
        };
        logger.verbose("request", access);
    }
    next();
};
