var _ = require('underscore');
var models = require('../models');
var Promise = require('bluebird');

module.exports = function(req, res, next) {
    Promise.try(function() {
        var sql = 'SELECT DISTINCT other_ci.id AS course_instance_id,s.short_name,s.long_name,s.start_date,s.end_date'
            + ' FROM course_instances AS ci'
            + ' JOIN courses AS c ON (c.id = ci.course_id)'
            + ' JOIN course_instances AS other_ci ON (other_ci.course_id = c.id)'
            + ' JOIN semesters AS s ON (s.id = other_ci.semester_id)'
            + ' WHERE ci.id = :courseInstanceId'
            + ' ORDER BY s.start_date DESC'
            + ';';
        var params = {
            courseInstanceId: req.params.courseInstanceId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        req.locals = _.extend({
            semesterList: results,
        }, req.locals);
        next();
    });
};
