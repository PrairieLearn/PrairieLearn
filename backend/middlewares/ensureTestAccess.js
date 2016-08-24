var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'ensureTestAccess.sql'));

module.exports = function(req, res, next) {
    var params = {
        test_instance_id: req.params.testInstanceId,
        user_id: res.locals.user.id,
    };
    sqldb.queryOneRow(sql.testInstance, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.testInstance = result.rows[0];

        var params = {
            test_id: res.locals.testInstance.test_id,
            course_instance_id: req.params.courseInstanceId,
            user_id: res.locals.user.id,
        };
        sqldb.queryOneRow(sql.test, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.test = result.rows[0];
            
            var params = {testId: req.params.testId, courseInstanceId: req.params.courseInstanceId};
            sqldb.queryOneRow(sql.test_set, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.testSet = result.rows[0];
                next();
            });
        });
    });
};
