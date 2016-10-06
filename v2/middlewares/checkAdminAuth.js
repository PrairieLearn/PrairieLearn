var ERR = require('async-stacktrace');
var path = require('path');

var logger = require('../lib/logger');
var sqldb = require('../lib/sqldb');
var error = require('../lib/error');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var params = {
        course_instance_id: req.params.courseInstanceId,
        uid: req.authUID,
    };
    sqldb.query(sql.all, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount === 0) return next(error.make(403, "Unauthorized"));
        res.locals.user = result.rows[0];
        next();
    });
};
