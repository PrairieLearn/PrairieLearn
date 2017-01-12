var ERR = require('async-stacktrace');
var _ = require('lodash');

var error = require('../lib/error');
var logger = require('../lib/logger');

module.exports = function(req, res, next) {
    _(req.cookies).each(function(value, key) {
        if (/^pl_/.test(key)) {
            res.clearCookie(key);
        }
    });
    next();
};
