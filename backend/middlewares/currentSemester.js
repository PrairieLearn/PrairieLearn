var _ = require('underscore');
var models = require('../models');
var Promise = require('bluebird');

module.exports = function(req, res, next) {
    Promise.try(function() {
        var sql = 'SELECT s.*'
            + ' FROM course_instances AS ci'
            + ' JOIN semesters AS s ON (s.id = ci.semester_id)'
            + ' WHERE ci.id = :courseInstanceId'
            + ';';
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
            semester: results[0],
        }, req.locals);
        next();
    });
};
