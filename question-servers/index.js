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
            questionModule.getData(question, course, variant_seed, function(err, questionData, consoleLog) {
                if (ERR(err, callback)) return;
                var variant = {
                    variant_seed: variant_seed,
                    params: questionData.params || {},
                    true_answer: questionData.true_answer || {},
                    options: questionData.options || {},
                    console: consoleLog || '',
                };
                callback(null, variant);
            });
        });
    },

    parseSubmission: function(submission, variant, question, course, callback) {
        this.getModule(question.type, function(err, questionModule) {
            if (ERR(err, callback)) return;
            questionModule.parseSubmission(submission, variant, question, course, function(err, new_submitted_answer, parse_errors) {
                if (ERR(err, callback)) return;
                callback(null, new_submitted_answer, parse_errors);
            });
        });
    },

    // must be called from within a transaction that has an update lock on the assessment_instance
    saveSubmission: function(client, submission, variant, question, course, callback) {
        const params = [
            variant.instance_question_id,
            submission.auth_user_id,
            submission.submitted_answer,
            submission.type,
            submission.credit,
            submission.mode,
            submission.variant_id,
        ];
        sqldb.callWithClientOneRow(client, 'submissions_insert', params, function(err, result) {
            if (ERR(err, callback)) return;
            const submission_id = result.rows[0].submission_id;
            module.exports.parseSubmission(submission, variant, question, course, (err, new_submitted_answer, parse_errors) => {
                if (ERR(err, callback)) return;
                const params = [
                    submission_id,
                    new_submitted_answer,
                    parse_errors,
                ];
                sqldb.callWithClient(client, 'submissions_update_parsing', params, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null, submission_id);
                });
            });
        });
    },

    gradeSubmission: function(submission, variant, question, course, options, callback) {
        this.getModule(question.type, function(err, questionModule) {
            if (ERR(err, callback)) return;
            questionModule.gradeSubmission(submission, variant, question, course, function(err, question_data) {
                if (ERR(err, callback)) return;
                question_data.correct = 
                callback(null, question_data);
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

                module.exports.gradeSubmission(submission, variant, question, course, {}, function(err, question_data) {
                    if (ERR(err, callback)) return;

                    let params = {
                        submission_id: submission_id,
                        auth_user_id: auth_user_id,
                        grading_method: question.grading_method,
                        score: question_data.score,
                        correct: (question_data.score >= 0.5),
                        feedback: question_data.feedback,
                        partial_scores: question_data.partial_scores,
                        submitted_answer: question_data.submitted_answer,
                        parse_errors: question_data.parse_errors,
                    };
                    sqldb.queryWithClientOneRow(client, sql.update_submission, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        var grading_job = result.rows[0];

                        if (question_data.params || question_data.true_answer) {
                            let params = {
                                variant_id: variant.id,
                                params: question_data.params,
                                true_answer: question_data.true_answer,
                            };
                            sqldb.queryWithClient(client, sql.update_variant, params, function(err) {
                                if (ERR(err, callback)) return;

                                callback(null, grading_job);
                            });

                        } else {
                            callback(null, grading_job);
                        }
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
