var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var params = {
        assessment_instance_id: req.params.assessmentInstanceId,
        user_id: res.locals.user.id,
    };
    sqldb.queryOneRow(sql.assessmentInstance, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.assessmentInstance = result.rows[0];

        var params = {
            assessment_id: res.locals.assessmentInstance.assessment_id,
            course_instance_id: req.params.courseInstanceId,
            user_id: res.locals.user.id,
        };
        sqldb.queryOneRow(sql.assessment, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.assessment = result.rows[0];
            
            var params = {assessmentId: req.params.assessmentId, courseInstanceId: req.params.courseInstanceId};
            sqldb.queryOneRow(sql.assessment_set, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.assessmentSet = result.rows[0];
                next();
            });
        });
    });
};
