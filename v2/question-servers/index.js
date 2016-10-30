var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var numeric = require('numeric');

var logger = require('../lib/logger');
var filePaths = require('../lib/file-paths');
var messageQueue = require('../lib/messageQueue');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var questionModules = {
    'ShortAnswer': require('./shortAnswer'),
    'Calculation': require('./calculation'),
};

module.exports = {
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

    gradeSubmission: function(submission, questionInstance, question, course, options, callback) {
        this.getModule(question.type, function(err, questionModule) {
            if (ERR(err, callback)) return;
            questionModule.gradeSubmission(submission, questionInstance, question, course, function(err, grading) {
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

                questionServers.gradeSubmission(submission, variant, question, course, {}, function(err, grading) {
                    if (ERR(err, callback)) return;

                    var params = {submission_id: submission_id};
                    sqldb.queryWithClientOneRow(client, sql.update_submission, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        var grading_log = result.rows[0];
                        callback(null, grading_log);
                    });
                });
            });
        } else if (question.grading_method == 'External') {
            var params = {submission_id: submission_id};
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
                    
                    var params = {submission_id: submission_id};
                    sqldb.queryWithClientOneRow(client, sql.update_submission_for_external_grading, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        var submission = result.rows[0].submission;
                        var grading_log = result.rows[0].grading_log;

                        messageQueue.sendToGradingQueue(grading_log, submission, variant, question, course, function(err) {
                            if (ERR(err, callback)) return;
                            callback(null, grading_log);
                        });
                    });
                });
        } else if (question.grading_method == 'Manual') {
            var params = {submission_id: submission_id};
            sqldb.queryWithClientOneRow(client, sql.update_submission_for_manual_grading, params, function(err, result) {
                if (ERR(err, callback)) return;
                var grading_log = result.rows[0].grading_log;
                callback(null, grading_log);
            });
        } else {
            callback(new Error('Unknown grading_method', {grading_method: question.grading_method}));
        }
    },
    
    renderScore: function(score, callback) {
        var color, text;
        if (score >= 0.8) {
            color = "success";
            text = "Correct!";
        } else if (score >= 0.5) {
            color = "warning";
            text = "Correct!";
        } else {
            color = "danger";
            text = "Incorrect.";
        }
        var perc = (score * 100).toFixed(0) + '%';
        var html = '<span class="label label-' + color + '">' + perc + '</span> ' + text;
        callback(null, html);
    },
};
