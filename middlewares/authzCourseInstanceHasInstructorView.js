var ERR = require('async-stacktrace');
var _ = require('lodash');

var config = require('../lib/config');
var error = require('../lib/error');

module.exports = function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_view) {
        return next(error.make(403, "Requires instructor authorization", {locals: res.locals}));
    }
    next();
};
