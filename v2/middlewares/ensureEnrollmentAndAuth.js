var ERR = require('async-stacktrace');
var path = require('path');
var logger = require('../lib/logger');
var error = require('../lib/error');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var params = {
        user_id: res.locals.user.id,
        course_instance_id: req.params.courseInstanceId,
    };
    sqldb.query(sql.all, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount === 0) return next(error.make(403, "Unauthorized"));
        res.locals.enrollment = result.rows[0];
        next();
    });
};
