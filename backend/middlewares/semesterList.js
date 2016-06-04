var _ = require('underscore');
var logger = require('../logger');
var sqldb = require('../sqldb');

module.exports = function(req, res, next) {
    var sql = 'SELECT DISTINCT other_ci.id AS course_instance_id,s.short_name,s.long_name,s.start_date,s.end_date'
        + ' FROM course_instances AS ci'
        + ' JOIN courses AS c ON (c.id = ci.course_id)'
        + ' JOIN course_instances AS other_ci ON (other_ci.course_id = c.id)'
        + ' JOIN semesters AS s ON (s.id = other_ci.semester_id)'
        + ' WHERE ci.id = $1'
        + ' ORDER BY s.start_date DESC'
        + ';';
    var params = [req.params.courseInstanceId];
    sqldb.query(sql, params, function(err, result) {
        if (err) {logger.error('semesterList query failed', err); return res.status(500).end();}
        req.locals = _.extend({
            semesterList: result.rows,
        }, req.locals);
        next();
    });
};
