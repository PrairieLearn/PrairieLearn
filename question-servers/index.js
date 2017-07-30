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
            questionModule.getData(question, course, variant_seed, function(err, courseErr, questionData, consoleLog) {
                if (ERR(err, callback)) return;
                if (courseErr) consoleLog = consoleLog + '\n' + courseErr.toString() + '\n';
                var variant = {
                    variant_seed: variant_seed,
                    params: questionData.params || {},
                    true_answer: questionData.true_answer || {},
                    options: questionData.options || {},
                    console: consoleLog || '',
                    valid: (courseErr == null),
                };
                callback(null, courseErr, variant);
            });
        });
    },

    makeAndInsertVariant: function(instance_question_id, authn_user_id, question, course, options, callback) {
        module.exports.makeVariant(question, course, options, (err, courseErr, variant) => {
            if (ERR(err, callback)) return;
            const params = {
                authn_user_id: authn_user_id,
                instance_question_id: instance_question_id,
                variant_seed: variant.variant_seed,
                question_params: variant.params,
                true_answer: variant.true_answer,
                options: variant.options,
                console: variant.console,
                valid: variant.valid,
            };
            sqldb.queryOneRow(sql.insert_variant, params, (err, result) => {
                if (ERR(err, callback)) return;
                const variant = result.rows[0];

                if (!courseErr && variant.console.length == 0) {
                    return callback(null, variant);
                }

                const instructor_message = courseErr ? courseErr.toString() : 'Console output during prepare';
                const stack = courseErr ? courseErr.stack : 'No stack trace';
                const courseErrData = courseErr ? courseErr.data : null;
                const params = [
                    variant.id,
                    'Error creating question variant', // student message
                    instructor_message,
                    true, // course_caused
                    {variant, question, course}, // course_data
                    {stack, courseErrData, options}, // system_data
                    authn_user_id,
                ];
                sqldb.call('errors_insert_for_variant', params, (err) => {
                    if (ERR(err, callback)) return;
                    return callback(null, variant);
                });
            });
            
        });
    },

    ensureVariant: function(instance_question_id, authn_user_id, question, course, options, callback) {
        // if we have an existing variant that is available then use
        // that one, otherwise make a new one
        var params = {
            instance_question_id: instance_question_id,
        };
        sqldb.query(sql.get_available_variant, params, function(err, result) {
            if (ERR(err, callback)) return;
            if (result.rowCount == 1) {
                return callback(null, result.rows[0]);
            }
            module.exports.makeAndInsertVariant(instance_question_id, authn_user_id, question, course, options, (err, variant) => {
                if (ERR(err, callback)) return;
                callback(null, variant);
            });
        });
    },

    render: function(panel, variant, question, submission, course, locals, callback) {
        this.getModule(question.type, function(err, questionModule) {
            if (ERR(err, callback)) return;
            questionModule.render(panel, variant, question, submission, course, locals, function(err, courseErr, html, consoleLog) {
                if (ERR(err, callback)) return;
                if (courseErr) consoleLog = consoleLog + '\n' + courseErr.toString() + '\n';
                if (consoleLog.length == 0) {
                    // guaranteed no courseErr
                    return callback(null, html);
                }

                const params = {
                    variant_id: variant.id,
                    extra_console: consoleLog,
                };
                sqldb.query(sql.variant_append_console, params, (err) => {
                    if (ERR(err, callback)) return;

                    const instructor_message = courseErr ? courseErr.toString() : 'Console output during prepare';
                    const stack = courseErr ? courseErr.stack : 'No stack trace';
                    const courseErrData = courseErr ? courseErr.data : null;
                    const params = [
                        variant.id,
                        'Error rendering question', // student message
                        instructor_message,
                        true, // course_caused
                        {panel, variant, question, submission, course}, // course_data
                        {stack, courseErrData, locals}, // system_data
                        locals.authn_user.user_id,
                    ];
                    sqldb.call('errors_insert_for_variant', params, (err) => {
                        if (ERR(err, callback)) return;
                        return callback(null, '');
                    });
                });
            });
        });
    },

    parseSubmission: function(client, submission, variant, question, course, callback) {
        this.getModule(question.type, function(err, questionModule) {
            if (ERR(err, callback)) return;
            questionModule.parseSubmission(submission, variant, question, course, function(err, courseErr, data, consoleLog) {
                if (ERR(err, callback)) return;
                if (courseErr) consoleLog = consoleLog + '\n' + courseErr.toString() + '\n';
                if (consoleLog.length == 0) {
                    // guaranteed no courseErr
                    return callback(null, data);
                }

                const params = {
                    variant_id: variant.id,
                    extra_console: consoleLog,
                };
                sqldb.queryWithClient(client, sql.variant_append_console, params, (err) => {
                    if (ERR(err, callback)) return;

                    const instructor_message = courseErr ? courseErr.toString() : 'Console output during parse';
                    const stack = courseErr ? courseErr.stack : 'No stack trace';
                    const courseErrData = courseErr ? courseErr.data : null;
                    const params = [
                        variant.id,
                        'Error parsing submitted answer', // student message
                        instructor_message,
                        true, // course_caused
                        {variant, question, submission, course}, // course_data
                        {stack, courseErrData}, // system_data
                        submission.auth_user_id,
                    ];
                    sqldb.callWithClient(client, 'errors_insert_for_variant', params, (err) => {
                        if (ERR(err, callback)) return;
                        return callback(null, data);
                    });
                });
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
            module.exports.parseSubmission(client, submission, variant, question, course, (err, data) => {
                if (ERR(err, callback)) return;

                if (data == null) {
                    // caller doesn't want anything updated, legacy code path for Calculation questions
                    // FIXME: set submission to be gradable
                    return callback(null, submission_id);
                }

                const params = {
                    variant_id: variant.id,
                    params: data.params,
                    true_answer: data.true_answer,
                };
                sqldb.queryWithClient(client, sql.update_variant, params, (err) => {
                    if (ERR(err, callback)) return;
                
                    const params = [
                        submission_id,
                        data.submitted_answer,
                        data.parse_errors,
                    ];
                    sqldb.callWithClient(client, 'submissions_update_parsing', params, function(err) {
                        if (ERR(err, callback)) return;
                        callback(null, submission_id);
                    });
                });
            });
        });
    },

    gradeSubmission: function(submission, variant, question, course, callback) {
        this.getModule(question.type, function(err, questionModule) {
            if (ERR(err, callback)) return;
            questionModule.gradeSubmission(submission, variant, question, course, function(err, courseErr, question_data, consoleLog) {
                if (ERR(err, callback)) return;
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

                module.exports.gradeSubmission(submission, variant, question, course, function(err, question_data) {
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
