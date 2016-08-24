var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'currentCourse.sql'));

module.exports = function(req, res, next) {
    var params = {course_instance_id: req.params.courseInstanceId};
    sqldb.queryOneRow(sql.all, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.course = result.rows[0];
        next();
    });
};
