var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var async = require('async');
var path = require('path');
var numeric = require('numeric');

var logger = require('../lib/logger');
var filePaths = require('../lib/file-paths');
var messageQueue = require('../lib/messageQueue');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var questionModules = {
    'ShortAnswer':       require('./shortAnswer'),
    'Calculation':       require('./calculation'),
    'File':              require('./calculation'),
    'Checkbox':          require('./calculation'),
    'MultipleChoice':    require('./calculation'),
    'MultipleTrueFalse': require('./calculation'),
};

var effectiveQuestionTypes = {
    'ShortAnswer':       'ShortAnswer',
    'Calculation':       'Calculation',
    'File':              'Calculation',
    'Checkbox':          'Calculation',
    'MultipleChoice':    'Calculation',
    'MultipleTrueFalse': 'Calculation',
};

module.exports = {
    getEffectiveQuestionType: function(type, callback) {
        if (_(effectiveQuestionTypes).has(type)) {
            callback(null, effectiveQuestionTypes[type]);
        } else {
            callback(new Error('Unknown question type: ' + type));
        }
    },

    getModule: function(type, callback) {
        if (_(questionModules).has(type)) {
            callback(null, questionModules[type]);
        } else {
            callback(new Error('Unknown question type: ' + type));
        }
    },

    makeVariant: function(question, course, options, callback) {
        var vid;
        if (_(options).has('vid')) {
            vid = options.vid;
        } else {
            vid = Math.floor(Math.random() * Math.pow(2, 32)).toString(36);
        }
        this.getModule(question.type, function(err, questionModule) {
            if (ERR(err, callback)) return;
            questionModule.getData(question, course, vid, function(err, questionData) {
                if (ERR(err, callback)) return;
                var variant = {
                    vid: vid,
                    params: questionData.params || {},
                    true_answer: questionData.true_answer || {},
                    options: questionData.options || {},
                };
                callback(null, variant);
            });
        });
    },

    gradeSubmission: function(submission, variant, question, course, options, callback) {
        this.getModule(question.type, function(err, questionModule) {
            if (ERR(err, callback)) return;
            questionModule.gradeSubmission(submission, variant, question, course, function(err, grading) {
                if (ERR(err, callback)) return;
                grading.correct = (grading.score >= 0.5);
                callback(null, grading);
            });
        });
    },

    // must be called from within a transaction that has an update lock on the assessment_instance
    gradeSavedSubmission: function(client, submission_id, auth_user_id, variant, question, course, callback) {
        if (question.grading_method == 'Internal') {
            var params = {submission_id: submission_id};
            sqldb.queryWithClientOneRow(client, sql.select_submission, params, function(err, result) {
                if (ERR(err, callback)) return;
                var submission = result.rows[0];

                module.exports.gradeSubmission(submission, variant, question, course, {}, function(err, grading) {
                    if (ERR(err, callback)) return;

                    var params = {
                        submission_id: submission_id,
                        auth_user_id: auth_user_id,
                        grading_method: question.grading_method,
                        score: grading.score,
                        correct: grading.correct,
                        feedback: grading.feedback,
                    };
                    sqldb.queryWithClientOneRow(client, sql.update_submission, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        var grading_log = result.rows[0];
                        callback(null, grading_log);
                    });
                });
            });
        } else if (question.grading_method == 'External') {
            var params = {
                submission_id: submission_id,
                auth_user_id: auth_user_id,
            };
            sqldb.queryWithClient(client, sql.cancel_outstanding_grading_requests, params, function(err, result) {
                if (ERR(err, callback)) return;
                async.each(result.rows, function(row, callback) {
                    var grading_id = row.id;
                    messageQueue.cancelGrading(grading_id, function(err) {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;
                    
                    var params = {
                        submission_id: submission_id,
                        auth_user_id: auth_user_id,
                        grading_method: question.grading_method,
                    };
                    sqldb.queryWithClientOneRow(client, sql.insert_grading_log_for_external_grading, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        var grading_log = result.rows[0];
                        callback(null, grading_log, grading_log.id);
                    });
                });
            });
        } else if (question.grading_method == 'Manual') {
            var params = {
                submission_id: submission_id,
                grading_method: question.grading_method,
            };
            sqldb.queryWithClientOneRow(client, sql.update_submission_for_manual_grading, params, function(err, result) {
                if (ERR(err, callback)) return;
                var grading_log = result.rows[0].grading_log;
                callback(null, grading_log);
            });
        } else {
            callback(new Error('Unknown grading_method', {grading_method: question.grading_method}));
        }
    },

    submitExternalGradingJob: function(grading_log_id, auth_user_id, callback) {
        var params = {
            grading_log_id: grading_log_id,
            auth_user_id: auth_user_id,
        };
        sqldb.query(sql.update_for_external_grading_job_submission, params, function(err, result) {
            if (ERR(err, callback)) return;
            var grading_log = result.rows[0].grading_log;
            var submission = result.rows[0].submission;
            var variant = result.rows[0].variant;
            var question = result.rows[0].question;
            var course = result.rows[0].course;

            messageQueue.sendToGradingQueue(grading_log, submission, variant, question, course, function(err) {
                if (ERR(err, callback)) return;
                callback(null, grading_log);
            });
        });
    },

    submitExternalGradingJobs: function(grading_log_ids, auth_user_id, callback) {
        async.each(grading_log_ids, function(grading_log_id, callback) {
            module.exports.submitExternalGradingJob(grading_log_id, auth_user_id, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        }, function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
};
