var _ = require('underscore');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'currentTest.sql'));

module.exports = function(req, res, next) {
    var params = [req.params.testId, req.params.courseInstanceId];
    sqldb.queryOneRow(sql.test, params, function(err, result) {
        if (err) return next(err);
        req.locals = _.extend({
            test: result.rows[0],
            testId: req.params.testId,
        }, req.locals);

        var params = [req.params.testId, req.params.courseInstanceId];
        sqldb.queryOneRow(sql.test_set, params, function(err, result) {
            if (err) return next(err);
            req.locals = _.extend({
                testSet: result.rows[0],
            }, req.locals);
            next();
        });
    });
};
