var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'checkAdminAuth.sql'));

module.exports = function(req, res, next) {
    var params = [req.params.courseInstanceId, req.authUID];
    sqldb.query(sql.all, params, function(err, result) {
        if (err) return next(err);
        if (result.rowCount === 0) return next(new Error("Unauthorized"));
        next();
    });
};
