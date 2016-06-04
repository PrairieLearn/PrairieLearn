var _ = require('underscore');
var logger = require('../logger');
var sqldb = require('../sqldb');

module.exports = function(req, res, next) {
    var sql = 'SELECT t.*'
        + ' FROM tests as t'
        + ' JOIN test_sets AS ts ON (ts.id = t.test_set_id)'
        + ' WHERE t.id = $1'
        + ' AND t.deleted_at IS NULL'
        + ' AND t.course_instance_id = $2'
        + ';';
    var params = [req.params.testId, req.params.courseInstanceId];
    sqldb.query(sql, params, function(err, result) {
        if (err) {logger.error('currentTest test query failed', err); return res.status(500).end();}
        if (result.rowCount !== 1) return res.status(404).end();
        req.locals = _.extend({
            test: result.rows[0],
            testId: req.params.testId,
        }, req.locals);
        var sql = 'SELECT ts.*'
            + ' FROM tests as t'
            + ' JOIN test_sets AS ts ON (ts.id = t.test_set_id)'
            + ' WHERE t.id = $1'
            + ' AND t.course_instance_id = $2'
            + ';';
        var params = [req.params.testId, req.params.courseInstanceId];
        sqldb.query(sql, params, function(err, result) {
            if (err) {logger.error('currentTest testSet query failed', err); return res.status(500).end();}
            if (result.rowCount !== 1) return res.status(404).end();
            req.locals = _.extend({
                testSet: result.rows[0],
            }, req.locals);
            next();
        });
    });
};
