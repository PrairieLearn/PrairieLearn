var _ = require('underscore');
var logger = require('../logger');
var sqldb = require('../sqldb');

module.exports = function(req, res, next) {
    // check that the requested question is in the current course
    var sql = 'SELECT q.*'
        + ' FROM questions AS q'
        + ' JOIN courses AS c ON (c.id = q.course_id)'
        + ' JOIN course_instances AS ci ON (ci.course_id = c.id)'
        + ' WHERE q.id = $1'
        + ' AND q.deleted_at IS NULL'
        + ' AND ci.id = $2'
        + ';';
    var params = [req.params.questionId, req.params.courseInstanceId];
    sqldb.query(sql, params, function(err, result) {
        if (err) {logger.error('currentQuestion query failed', err); return res.status(500).end();}
        if (result.rowCount !== 1) return res.status(404).end();
        req.locals = _.extend({
            question: result.rows[0],
            questionId: req.params.questionId,
        }, req.locals);
        next();
    });
};
