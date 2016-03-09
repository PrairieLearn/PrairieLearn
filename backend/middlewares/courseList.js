var _ = require('underscore');
var models = require('../models');
var Promise = require('bluebird');

module.exports = function(req, res, next) {
    Promise.try(function() {
        var sql = 'WITH q AS ('
            + '     SELECT c.id AS course_id,c.short_name,max(s.end_date) AS max_end_date'
            + '     FROM enrollments AS e'
            + '     JOIN users AS u ON (e.user_id = u.id)'
            + '     JOIN course_instances AS ci ON (e.course_instance_id = ci.id)'
            + '     JOIN courses AS c ON (ci.course_id = c.id)'
            + '     JOIN semesters AS s ON (ci.semester_id = s.id)'
            + '     WHERE uid = :uid'
            + '     AND role >= \'TA\''
            + '     GROUP BY c.id'
            + ' )'
            + ' SELECT q.short_name,ci.id AS course_instance_id'
            + ' FROM q'
            + ' JOIN semesters AS s ON (s.end_date = q.max_end_date)'
            + ' JOIN course_instances AS ci ON (ci.semester_id = s.id AND ci.course_id = q.course_id)'
            + ' ORDER BY q.short_name'
            + ';';
        var params = {
            uid: req.authUID,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        req.locals = _.extend({
            courseList: results,
        }, req.locals);
        next();
    });
};
