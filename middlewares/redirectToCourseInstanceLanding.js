var ERR = require('async-stacktrace');
var _ = require('lodash');

var error = require('../lib/error');
var logger = require('../lib/logger');

module.exports = function(req, res, next) {
    if (res.locals.authz_data.has_admin_view) {
        res.redirect(res.locals.urlPrefix + '/admin/assessments');
    } else {
        res.redirect(res.locals.urlPrefix + '/assessments');
    }
};
