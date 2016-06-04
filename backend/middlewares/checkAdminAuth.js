var logger = require('../logger');
var sqldb = require('../sqldb');

module.exports = function(req, res, next) {
    var sql = 'SELECT *'
        + ' FROM enrollments AS e'
        + ' JOIN users as u ON (u.id = e.user_id)'
        + ' WHERE e.course_instance_id = $1'
        + ' AND u.uid = $2'
        + ' AND e.role >= \'TA\''
        + ';';
    var params = [req.params.courseInstanceId, req.authUID];
    sqldb.query(sql, params, function(err, result) {
        if (err) {logger.error('admin auth query failed', err); return res.status(500).end();}
        if (result.rowCount === 0) {
            return res.status(403).end();
        }
        next();
    });
};
