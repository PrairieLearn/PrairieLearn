var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var ejs = require('ejs');

var error = require('../lib/error');
var logger = require('../lib/logger');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');
var externalGradingSocket = require('../lib/external-grading-socket');


var sql = sqlLoader.loadSqlEquiv(__filename);

var assessmentModules = {
    'Homework': require('./homework'),
    'Exam': require('./exam'),
};

module.exports = {
    getModule: function(type, callback) {
        if (_(assessmentModules).has(type)) {
            callback(null, assessmentModules[type]);
        } else {
            callback(new Error('Unknown assessment type: ' + type));
        }
    },

    updateExternalGrading: function(assessment_type, grading_job_id, grading, callback) {
        this.getModule(assessment_type, function(err, assessmentModule) {
            if (ERR(err, callback)) return;
            assessmentModule.updateExternalGrading(grading_job_id, grading, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },

    gradeAssessmentInstance: function(assessment_type, assessment_instance_id, auth_user_id, credit, finish, callback) {
        this.getModule(assessment_type, function(err, assessmentModule) {
            if (ERR(err, callback)) return;
            assessmentModule.gradeAssessmentInstance(assessment_instance_id, auth_user_id, credit, finish, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },

    renderText: function(assessment, urlPrefix, callback) {
        if (!assessment.text) return callback(null, null);
        var context = {
            clientFilesCourse: urlPrefix + '/clientFilesCourse',
            clientFilesCourseInstance: urlPrefix + '/clientFilesCourseInstance',
            clientFilesAssessment: urlPrefix + '/assessment/' + assessment.id + '/clientFilesAssessment',
        };
        var assessment_text_templated;
        try {
            assessment_text_templated = ejs.render(assessment.text, context);
        } catch (e) {
            return ERR(e, callback);
        }
        callback(null, assessment_text_templated);
    },
};

module.exports.processGradingResult = function(content) {
    var assessment_type;
    async.series([
        function(callback) {
            if (!_(content.gradingId).isInteger()) return callback(new Error('invalid gradingId'));
            var params = {
                grading_job_id: content.gradingId,
            };
            sqldb.queryOneRow(sql.select_assessment_info, params, function(err, result) {
                if (ERR(err, callback)) return;

                assessment_type = result.rows[0].assessment_type;
                callback(null);
            });
        },
        function(callback) {
            if (!_(content.grading).isObject()) {
                return callback(error.makeWithData('invalid grading', {content: content}));
            }
            if (!_(content.grading.score).isNumber()) {
                return callback(error.makeWithData('invalid grading.score', {content: content}));
            }
            if (content.grading.score < 0 || content.grading.score > 1) {
                return callback(error.makeWithData('grading.score out of range', {content: content}));
            }
            if (_(content.grading).has('feedback') && !_(content.grading.feedback).isObject()) {
                return callback(error.makeWithData('invalid grading.feedback', {content: content}));
            }
            const params = [
                content.gradingId;
                content.grading.score,
                content.grading.feedback,
                content.grading.startTime,
                content.grading.endTime,
            ];
            sqldb.call('grading_jobs_process_external', params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], function(err) {
        if (ERR(err, function() {})) {
            // FIXME: call sprocs/errors_insert here
            logger.error('processGradingResult: error',
                         {message: err.message, stack: err.stack, data: JSON.stringify(err.data)});
        }
        externalGradingSocket.gradingLogStatusUpdated(content.gradingId);
    });
};
