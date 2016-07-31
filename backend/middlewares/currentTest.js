var _ = require('underscore');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'currentTest.sql'));

module.exports = function(req, res, next) {
    var params = {
        testId: req.locals.testInstance ? req.locals.testInstance.test_id : req.params.testId,
        courseInstanceId: req.params.courseInstanceId,
        userId: req.locals.user.id,
        mode: req.mode,
        role: req.locals.enrollment.role,
    };
    sqldb.queryOneRow(sql.test, params, function(err, result) {
        if (err) return next(err);
        req.locals.test = result.rows[0];
        req.locals.testId = req.params.testId;

        var params = {
            testId: req.locals.testInstance ? req.locals.testInstance.test_id : req.params.testId,
            courseInstanceId: req.params.courseInstanceId,
        };
        sqldb.queryOneRow(sql.test_set, params, function(err, result) {
            if (err) return next(err);
            req.locals.testSet = result.rows[0];
            next();
        });
    });
};
