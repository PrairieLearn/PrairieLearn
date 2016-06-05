var _ = require('underscore');
var logger = require('../logger');
var sqldb = require('../sqldb');

module.exports = function(req, res, next) {
    // check that the requested test question is in the requested test
    var sql = 'SELECT tq.*'
        + ' FROM test_questions AS tq'
        + ' WHERE tq.id = $1'
        + ' AND tq.test_id = $2'
        + ' AND tq.deleted_at IS NULL'
        + ';';
    var params = [req.params.testQuestionId, req.params.testId];
    sqldb.query(sql, params, function(err, result) {
        if (err) {logger.error('currentTestQuestion query failed', err); return res.status(500).end();}
        if (result.rowCount !== 1) return res.status(404).end();
        req.locals = _.extend({
            testQuestion: result.rows[0],
            testQuestionId: req.params.testQuestionId,
        }, req.locals);
        next();
    });
};
