var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'currentTest.sql'));

module.exports = function(req, res, next) {
    var params = {
        testId: res.locals.testId ? res.locals.testId : req.params.testId,
        courseInstanceId: req.params.courseInstanceId,
        userId: res.locals.user.id,
        mode: req.mode,
        role: res.locals.enrollment.role,
    };
    sqldb.queryOneRow(sql.test, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.test = result.rows[0];
        res.locals.testId = res.locals.testId ? res.locals.testId : req.params.testId;

        var params = {
            testId: res.locals.testId ? res.locals.testId : req.params.testId,
            courseInstanceId: req.params.courseInstanceId,
        };
        sqldb.queryOneRow(sql.test_set, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.testSet = result.rows[0];
            next();
        });
    });
};
