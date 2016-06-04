var _ = require('underscore');
var logger = require('../logger');
var sqldb = require('../sqldb');

module.exports = function(req, res, next) {
    var sql = 'SELECT c.*'
        + ' FROM course_instances AS ci'
        + ' JOIN courses AS c ON (c.id = ci.course_id)'
        + ' WHERE ci.id = $1'
        + ';';
    var params = [req.params.courseInstanceId];
    sqldb.query(sql, params, function(err, result) {
        if (err) {logger.error('currentCourse query failed', err); return res.status(500).end();}
        if (err) return res.status(500).end();
        if (result.rowCount !== 1) return res.status(404).end();
        req.locals = _.extend({
            course: result.rows[0],
        }, req.locals);
        next();
    });
};
