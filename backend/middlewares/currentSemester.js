var _ = require('underscore');
var logger = require('../logger');
var sqldb = require('../sqldb');

module.exports = function(req, res, next) {
    var sql = 'SELECT s.*'
        + ' FROM course_instances AS ci'
        + ' JOIN semesters AS s ON (s.id = ci.semester_id)'
        + ' WHERE ci.id = $1'
        + ';';
    var params = [req.params.courseInstanceId];
    sqldb.query(sql, params, function(err, result) {
        if (err) {logger.error('currentSemester query failed', err); return res.status(500).end();}
        if (result.rowCount !== 1) return res.status(404).end();
        req.locals = _.extend({
            semester: result.rows[0],
        }, req.locals);
        next();
    });
};
