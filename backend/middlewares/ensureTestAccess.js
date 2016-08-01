var ERR = require('async-stacktrace');
var _ = require('underscore');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'ensureTestAccess.sql'));

module.exports = function(req, res, next) {
    var params = {testInstanceId: req.params.testInstanceId, userId: req.locals.user.id};
    sqldb.queryOneRow(sql.testInstance, params, function(err, result) {
        if (ERR(err, next)) return;
        req.locals.testInstance = result.rows[0];

        var params = {
            testId: req.locals.testInstance.test_id,
            courseInstanceId: req.params.courseInstanceId,
            userId: req.locals.user.id,
        };
        sqldb.queryOneRow(sql.test, params, function(err, result) {
            if (ERR(err, next)) return;
            req.locals.test = result.rows[0];
            
            var params = {testId: req.params.testId, courseInstanceId: req.params.courseInstanceId};
            sqldb.queryOneRow(sql.test_set, params, function(err, result) {
                if (ERR(err, next)) return;
                req.locals.testSet = result.rows[0];
                next();
            });
        });
    });
};
