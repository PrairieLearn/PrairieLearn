var ERR = require('async-stacktrace');
var _ = require('lodash');

var logger = require('../lib/logger');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var params = {
        user_id: res.locals.authn_user.id,
        course_instance_id: req.params.course_instance_id,
    };
    sqldb.queryOneRow(sql.nav_data, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.nav_data = result.rows[0].nav_data;
        res.locals.course = result.rows[0].course;
        res.locals.course_instance = result.rows[0].course_instance;
        next();
    });
};
