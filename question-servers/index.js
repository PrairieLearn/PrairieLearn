var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var messageQueue = require('../lib/messageQueue');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var questionModules = {
    'Calculation':       require('./calculation'),
    'File':              require('./calculation'),
    'Checkbox':          require('./calculation'),
    'MultipleChoice':    require('./calculation'),
    'MultipleTrueFalse': require('./calculation'),
    'Freeform':          require('./freeform'),
};

var effectiveQuestionTypes = {
    'Calculation':       'Calculation',
    'File':              'Calculation',
    'Checkbox':          'Calculation',
    'MultipleChoice':    'Calculation',
    'MultipleTrueFalse': 'Calculation',
    'Freeform':          'Freeform',
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
        var variant_seed;
        if (_(options).has('variant_seed')) {
            variant_seed = options.variant_seed;
        } else {
            variant_seed = Math.floor(Math.random() * Math.pow(2, 32)).toString(36);
        }
        this.getModule(question.type, function(err, questionModule) {
            if (ERR(err, callback)) return;
            questionModule.getData(question, course, variant_seed, function(err, questionData) {
                if (ERR(err, callback)) return;
                var variant = {
                    variant_seed: variant_seed,
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
            let params = {submission_id: submission_id};
            sqldb.queryWithClientOneRow(client, sql.select_submission, params, function(err, result) {
                if (ERR(err, callback)) return;
                var submission = result.rows[0];

                module.exports.gradeSubmission(submission, variant, question, course, {}, function(err, grading) {
                    if (ERR(err, callback)) return;

                    let params = {
                        submission_id: submission_id,
                        auth_user_id: auth_user_id,
                        grading_method: question.grading_method,
                        score: grading.score,
                        correct: grading.correct,
                        feedback: grading.feedback,
                    };
                    sqldb.queryWithClientOneRow(client, sql.update_submission, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        var grading_job = result.rows[0];
                        callback(null, grading_job);
                    });
                });
            });
        } else if (question.grading_method == 'External') {
            let params = {
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
                    sqldb.queryWithClientOneRow(client, sql.insert_grading_job_for_external_grading, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        var grading_job = result.rows[0];
                        callback(null, grading_job);
                    });
                });
            });
        } else if (question.grading_method == 'Manual') {
            let params = {
                submission_id: submission_id,
                auth_user_id: auth_user_id,
                grading_method: question.grading_method,
            };
            sqldb.queryWithClientOneRow(client, sql.update_submission_for_manual_grading, params, function(err, result) {
                if (ERR(err, callback)) return;
                var grading_job = result.rows[0];
                callback(null, grading_job);
            });
        } else {
            callback(new Error('Unknown grading_method', {grading_method: question.grading_method}));
        }
    },

    submitExternalGradingJob: function(grading_job_id, auth_user_id, callback) {
        var params = {
            grading_job_id: grading_job_id,
            auth_user_id: auth_user_id,
        };
        sqldb.query(sql.update_for_external_grading_job_submission, params, function(err, result) {
            if (ERR(err, callback)) return;
            var grading_job = result.rows[0].grading_job;
            var submission = result.rows[0].submission;
            var variant = result.rows[0].variant;
            var question = result.rows[0].question;
            var course = result.rows[0].course;

            messageQueue.sendToGradingQueue(grading_job, submission, variant, question, course);
            callback(null, grading_job);
        });
    },

    submitExternalGradingJobs: function(grading_job_ids, auth_user_id, callback) {
        async.each(grading_job_ids, function(grading_job_id, callback) {
            module.exports.submitExternalGradingJob(grading_job_id, auth_user_id, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        }, function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
};
