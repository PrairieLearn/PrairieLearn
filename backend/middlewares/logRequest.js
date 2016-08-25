var config = require('../config');
var error = require('../error');
var logger = require('../logger');

module.exports = function(req, res, next) {
    if (req.method !== 'OPTIONS') {
        var access = {
            timestamp: (new Date()).toISOString(),
            ip: req.ip,
            forwardedIP: req.headers['x-forwarded-for'],
            authUID: req.authUID,
            authRole: req.authRole,
            userUID: req.userUID,
            userRole: req.userRole,
            mode: req.mode,
            method: req.method,
            path: req.path,
            params: req.params,
            body: req.body,
        };
        logger.info("request", access);
    }
    next();
};
