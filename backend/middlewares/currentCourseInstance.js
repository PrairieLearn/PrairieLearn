var _ = require('underscore');
var logger = require('../logger');
var sqldb = require('../sqldb');

module.exports = function(req, res, next) {
    var sql = 'SELECT ci.*'
        + ' FROM course_instances AS ci'
        + ' WHERE ci.id = $1'
        + ';';
    var params = [req.params.courseInstanceId];
    sqldb.query(sql, params, function(err, result) {
        if (err) {logger.error('currentCourseInstance query failed', err); return res.status(500).end();}
        req.locals = _.extend({
            courseInstance: result.rows[0],
            courseInstanceId: req.params.courseInstanceId,
        }, req.locals);
        next();
    });
};
