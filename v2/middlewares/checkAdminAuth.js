var ERR = require('async-stacktrace');
var path = require('path');

var logger = require('../logger');
var sqldb = require('../sqldb');
var error = require('../error');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'checkAdminAuth.sql'));

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
