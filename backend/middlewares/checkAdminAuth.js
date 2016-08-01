var ERR = require('async-stacktrace');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'checkAdminAuth.sql'));

module.exports = function(req, res, next) {
    var params = [req.params.courseInstanceId, req.authUID];
    sqldb.query(sql.all, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount === 0) return next(error.make(403, "Unauthorized"));
        next();
    });
};
