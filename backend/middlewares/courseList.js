var _ = require('underscore');
var logger = require('../logger');
var sqldb = require('../sqldb');

module.exports = function(req, res, next) {
    var sql = 'WITH q AS ('
        + '     SELECT c.id AS course_id,c.short_name,max(s.end_date) AS max_end_date'
        + '     FROM enrollments AS e'
        + '     JOIN users AS u ON (e.user_id = u.id)'
        + '     JOIN course_instances AS ci ON (e.course_instance_id = ci.id)'
        + '     JOIN courses AS c ON (ci.course_id = c.id)'
        + '     JOIN semesters AS s ON (ci.semester_id = s.id)'
        + '     WHERE uid = $1'
        + '     AND role >= \'TA\''
        + '     GROUP BY c.id'
        + ' )'
        + ' SELECT q.short_name,ci.id AS course_instance_id'
        + ' FROM q'
        + ' JOIN semesters AS s ON (s.end_date = q.max_end_date)'
        + ' JOIN course_instances AS ci ON (ci.semester_id = s.id AND ci.course_id = q.course_id)'
        + ' ORDER BY q.short_name'
        + ';';
    var params = [req.authUID];
    sqldb.query(sql, params, function(err, result) {
        if (err) {logger.error('courseList query failed', err); return res.status(500).end();}
        req.locals = _.extend({
            courseList: result.rows,
        }, req.locals);
        next();
    });
};
