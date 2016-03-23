var _ = require('underscore');
var models = require('../models');
var Promise = require('bluebird');

module.exports = function(req, res, next) {
    Promise.try(function() {
        var sql = 'SELECT c.*'
            + ' FROM course_instances AS ci'
            + ' JOIN courses AS c ON (c.id = ci.course_id)'
            + ' WHERE ci.id = :courseInstanceId'
            + ';'
        var params = {
            courseInstanceId: req.params.courseInstanceId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        if (results.length != 1) {
            return res.status(404).end();
            //return sendError(res, 404, "no course_instance with id = " + req.params.courseInstanceId);
        }
        req.locals = _.extend({
            course: results[0],
        }, req.locals);
        next();
    });
};
