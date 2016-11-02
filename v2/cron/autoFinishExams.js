var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var logger = require('../lib/logger');
var error = require('../lib/error');
var assessmentsExam = require('../assessments/exam');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.run = function(callback) {
    sqldb.query(sql.select_exam_list, [], function(err, result) {
        if (ERR(err, callback)) return;
        var examList = result.rows;

        async.eachSeries(examList, function(examItem) {
            logger.info('autoFinishExams: finishing ' + examItem.assessment_instance_id, examItem);
            var auth_user_id = null; // graded by the system
            var finishExam = true; // close the exam after grading it
            assessmentsExam.gradeAssessmentInstance(examItem.assessment_instance_id, auth_user_id, examItem.credit, finishExam, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });                
        }, function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    });
};
