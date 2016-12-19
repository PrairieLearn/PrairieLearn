var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var logger = require('../lib/logger');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var params = {course_instance_id: req.params.courseInstanceId};
    sqldb.query(sql.all, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.courseInstanceList = result.rows;
        next();
    });
};
