var _ = require('underscore');

module.exports = function(req, res, next) {
    req.locals = _.extend({
        urlPrefix: '/pl/' + req.params.courseInstanceId,
    }, req.locals);
    next();
};
