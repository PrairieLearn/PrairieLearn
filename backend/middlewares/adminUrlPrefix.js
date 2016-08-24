var ERR = require('async-stacktrace');
var _ = require('lodash');

module.exports = function(req, res, next) {
    res.locals.urlPrefix = '/admin/' + req.params.courseInstanceId;
    next();
};
