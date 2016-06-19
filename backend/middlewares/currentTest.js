var _ = require('underscore');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'currentTest.sql'));

module.exports = function(req, res, next) {
    var params = [req.params.testId, req.params.courseInstanceId];
    sqldb.query(sql.test, params, function(err, result) {
        if (err) {logger.error('currentTest test query failed', err); return res.status(500).end();}
        if (result.rowCount !== 1) return res.status(404).end();
        req.locals = _.extend({
            test: result.rows[0],
            testId: req.params.testId,
        }, req.locals);

        var params = [req.params.testId, req.params.courseInstanceId];
        sqldb.query(sql.test_set, params, function(err, result) {
            if (err) {logger.error('currentTest testSet query failed', err); return res.status(500).end();}
            if (result.rowCount !== 1) return res.status(404).end();
            req.locals = _.extend({
                testSet: result.rows[0],
            }, req.locals);
            next();
        });
    });
};
