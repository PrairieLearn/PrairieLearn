var _ = require('underscore');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'userCourseInstanceList.sql'));

module.exports = function(req, res, next) {
    var params = [req.params.courseInstanceId];
    sqldb.query(sql.all, params, function(err, result) {
        if (err) return next(err);
        req.locals.courseInstanceList = result.rows;
        next();
    });
};
