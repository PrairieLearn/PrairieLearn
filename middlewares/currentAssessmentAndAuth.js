var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var logger = require('../lib/logger');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var params = {
        assessment_id: res.locals.assessmentId ? res.locals.assessmentId : req.params.assessmentId,
        course_instance_id: req.params.courseInstanceId,
        user_id: res.locals.user.user_id,
        mode: req.mode,
        role: res.locals.enrollment.role,
    };
    sqldb.queryOneRow(sql.assessment, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.assessment = result.rows[0];
        res.locals.assessmentId = res.locals.assessment.id;

        var params = {
            assessment_id: res.locals.assessmentId,
            course_instance_id: req.params.courseInstanceId,
        };
        sqldb.queryOneRow(sql.assessment_set, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.assessmentSet = result.rows[0];
            next();
        });
    });
};
