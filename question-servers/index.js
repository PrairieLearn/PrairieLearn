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

    writeCourseErrs: function(courseErrs, variant_id, authn_user_id, studentMessage, courseData, callback) {
        async.eachSeries(courseErrs, (courseErr, callback) => {
            const params = [
                variant_id,
                studentMessage,
                courseErr.toString(), // instructor message
                true, // course_caused
                courseData,
                {stack: courseErr.stack, courseErrData: courseErr.data}, // system_data
                authn_user_id,
            ];
            sqldb.call('errors_insert_for_variant', params, (err) => {
                if (ERR(err, callback)) return;
                return callback(null);
            });
        }, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
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
            questionModule.generate(question, course, variant_seed, function(err, courseErrs, data) {
                if (ERR(err, callback)) return;
                const hasFatalError = _.some(_.map(courseErrs, 'fatal'));
                var variant = {
                    variant_seed: variant_seed,
                    params: data.params || {},
                    true_answer: data.true_answer || {},
                    options: data.options || {},
                    valid: !hasFatalError,
                };
                if (hasFatalError) {
                    return callback(null, courseErrs, variant);
                }
                questionModule.prepare(question, course, variant, function(err, extraCourseErrs, data) {
                    if (ERR(err, callback)) return;
                    courseErrs.push(...extraCourseErrs);
                    const hasFatalError = _.some(_.map(courseErrs, 'fatal'));
                    var variant = {
                        variant_seed: variant_seed,
                        params: data.params || {},
                        true_answer: data.true_answer || {},
                        options: data.options || {},
                        valid: !hasFatalError,
                    };
                    callback(null, courseErrs, variant);
                });
            });
        });
    },

    makeAndInsertVariant: function(instance_question_id, authn_user_id, question, course, options, callback) {
        module.exports.makeVariant(question, course, options, (err, courseErrs, variant) => {
            if (ERR(err, callback)) return;
            const params = {
                authn_user_id: authn_user_id,
                instance_question_id: instance_question_id,
                variant_seed: variant.variant_seed,
                question_params: variant.params,
                true_answer: variant.true_answer,
                options: variant.options,
                valid: variant.valid,
            };
            sqldb.queryOneRow(sql.insert_variant, params, (err, result) => {
                if (ERR(err, callback)) return;
                const variant = result.rows[0];

                const studentMessage = 'Error creating question variant';
                const courseData = {variant, question, course};
                module.exports.writeCourseErrs(courseErrs, variant.id, authn_user_id, studentMessage, courseData, (err) => {
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
            questionModule.render(panel, variant, question, submission, course, locals, function(err, courseErrs, html) {
                if (ERR(err, callback)) return;
                
                const studentMessage = 'Error rendering question';
                const courseData = {panel, variant, question, submission, course};
                module.exports.writeCourseErrs(courseErrs, variant.id, locals.authn_user.user_id, studentMessage, courseData, (err) => {
                    if (ERR(err, callback)) return;
                    return callback(null, html);
                });
            });
        });
    },

    // must be called from within a transaction that has an update lock on the assessment_instance
    parse: function(client, submission, variant, question, course, callback) {
        this.getModule(question.type, function(err, questionModule) {
            if (ERR(err, callback)) return;
            questionModule.parse(submission, variant, question, course, function(err, courseErrs, data) {
                if (ERR(err, callback)) return;

                const studentMessage = 'Error parsing submission';
                const courseData = {variant, question, submission, course};
                module.exports.writeCourseErrs(courseErrs, variant.id, submission.auth_user_id, studentMessage, courseData, (err) => {
                    if (ERR(err, callback)) return;
                    return callback(null, data);
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
            module.exports.parse(client, submission, variant, question, course, (err, data) => {
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

    grade: function(submission, variant, question, course, authn_user_id, callback) {
        this.getModule(question.type, function(err, questionModule) {
            if (ERR(err, callback)) return;
            questionModule.grade(submission, variant, question, course, function(err, courseErrs, data) {
                if (ERR(err, callback)) return;

                const studentMessage = 'Error grading submission';
                const courseData = {variant, question, submission, course};
                module.exports.writeCourseErrs(courseErrs, variant.id, authn_user_id, studentMessage, courseData, (err) => {
                    if (ERR(err, callback)) return;
                    return callback(null, data);
                });
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

                module.exports.grade(submission, variant, question, course, auth_user_id, function(err, question_data) {
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
