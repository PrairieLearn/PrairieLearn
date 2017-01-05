var ERR = require('async-stacktrace');
var _ = require('lodash');

var config = require('../lib/config');
var error = require('../lib/error');

module.exports = function(req, res, next) {
    if (!res.locals.is_administrator) {
        return next(error.make(403, "Requires administrator privileges", {locals: res.locals}));
    }
    next();
};
