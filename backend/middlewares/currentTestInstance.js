var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'currentTestInstance.sql'));

module.exports = function(req, res, next) {
    var params = {
        testInstanceId: res.locals.testInstanceId ? res.locals.testInstanceId : req.params.testInstanceId,
        userId: res.locals.user.id,
    };
    sqldb.queryOneRow(sql.all, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.testInstance = result.rows[0];
        res.locals.testId = res.locals.testInstance.test_id;
        next();
    });
};
