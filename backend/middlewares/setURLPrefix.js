var _ = require('underscore');

module.exports = function(req, res, next) {
    req.locals = _.extend({
        urlPrefix: '/pl/' + req.params.courseInstanceId + '/admin',
    }, req.locals);
    next();
};
