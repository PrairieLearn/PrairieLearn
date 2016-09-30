var config = require('../lib/config');
var error = require('../lib/error');
var logger = require('../lib/logger');

module.exports = function(req, res, next) {
    if (req.method !== 'OPTIONS') {
        var access = {
            timestamp: (new Date()).toISOString(),
            ip: req.ip,
            forwardedIP: req.headers['x-forwarded-for'],
            auth_user: res.locals.auth_user,
            method: req.method,
            path: req.path,
            params: req.params,
            body: req.body,
        };
        logger.info("request", access);
    }
    next();
};
