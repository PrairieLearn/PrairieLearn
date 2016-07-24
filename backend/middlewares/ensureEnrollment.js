var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'ensureEnrollment.sql'));

module.exports = function(req, res, next) {
    var params = [req.locals.user.id, req.params.courseInstanceId];
    sqldb.query(sql.all, params, function(err, result) {
        if (err) return next(err);
        if (result.rowCount === 0) return next(error.make(403, "Unauthorized"));
        req.locals.enrollment = result.rows[0];
        next();
    });
};
