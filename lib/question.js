var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var messageQueue = require('./messageQueue');
var sqldb = require('./sqldb');
var sqlLoader = require('./sql-loader');
var questionServers = require('../question-servers');

var sql = sqlLoader.loadSqlEquiv(__filename);

/**
 * Question module.
 * @module question
 */
module.exports = {
    writeCourseErrs: function(client, courseErrs, variant_id, authn_user_id, studentMessage, courseData, callback) {
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
            if (client) {
                sqldb.callWithClient(client, 'errors_insert_for_variant', params, (err) => {
                    if (ERR(err, callback)) return;
                    return callback(null);
                });
            } else {
                sqldb.call('errors_insert_for_variant', params, (err) => {
                    if (ERR(err, callback)) return;
                    return callback(null);
                });
            }
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
        questionServers.getModule(question.type, function(err, questionModule) {
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

    makeAndInsertVariant: function(client, instance_question_id, user_id, authn_user_id, question, course, options, callback) {
        module.exports.makeVariant(question, course, options, (err, courseErrs, variant) => {
            if (ERR(err, callback)) return;

            const params = [
                variant.variant_seed,
                variant.params,
                variant.true_answer,
                variant.options,
                variant.valid,
                instance_question_id,
                question.id,
                user_id,
                authn_user_id,
            ];
            sqldb.callWithClientOneRow(client, 'variants_insert', params, (err, result) => {
                if (ERR(err, callback)) return;
                const variant = result.rows[0];

                const studentMessage = 'Error creating question variant';
                const courseData = {variant, question, course};
                module.exports.writeCourseErrs(client, courseErrs, variant.id, authn_user_id, studentMessage, courseData, (err) => {
                    if (ERR(err, callback)) return;
                    return callback(null, variant);
                });
            });
        });
    },

    ensureVariant: function(client, instance_question_id, user_id, authn_user_id, question, course, options, require_open, callback) {
        if (instance_question_id != null) {
            // if we have an existing variant that is open then use
            // that one, otherwise make a new one
            var params = {
                instance_question_id: instance_question_id,
                require_open: require_open,
            };
            sqldb.queryWithClient(client, sql.get_open_variant, params, function(err, result) {
                if (ERR(err, callback)) return;
                if (result.rowCount == 1) {
                    const variant = result.rows[0];
                    return callback(null, variant);
                }
                module.exports.makeAndInsertVariant(client, instance_question_id, user_id, authn_user_id, question, course, options, (err, variant) => {
                    if (ERR(err, callback)) return;
                    callback(null, variant);
                });
            });
        } else {
            // if we don't have instance_question_id, just make a new variant
            module.exports.makeAndInsertVariant(client, instance_question_id, user_id, authn_user_id, question, course, options, (err, variant) => {
                if (ERR(err, callback)) return;
                callback(null, variant);
            });
        }
    },

    render: function(renderSelection, variant, question, submission, submissions, course, locals, callback) {
        questionServers.getModule(question.type, function(err, questionModule) {
            if (ERR(err, callback)) return;
            questionModule.render(renderSelection, variant, question, submission, submissions, course, locals, function(err, courseErrs, htmls) {
                if (ERR(err, callback)) return;
                
                const studentMessage = 'Error rendering question';
                const courseData = {variant, question, submission, course};
                module.exports.writeCourseErrs(null, courseErrs, variant.id, locals.authn_user.user_id, studentMessage, courseData, (err) => {
                    if (ERR(err, callback)) return;
                    return callback(null, htmls);
                });
            });
        });
    },

    /**
     * Save a new submission to a variant into the database.
     * 
     * @param {Object} submission - The submission to save (should not have an id property yet).
     * @param {Object} variant - The variant to submit to.
     * @param {Object} question - The question for the variant.
     * @param {Object} course - The course for the variant.
     * @param {function} callback - The callback(err, submission_id) function.
     */
    saveSubmission: function(submission, variant, question, course, callback) {
        let questionModule, courseErrs, data, submission_id;
        sqldb.beginTransaction(function(err, client, done) {
            if (ERR(err, callback)) return;
            async.series([
                (callback) => {
                    sqldb.callWithClient(client, 'variants_lock', [variant.id], (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
                (callback) => {
                    questionServers.getModule(question.type, (err, ret_questionModule) => {
                        if (ERR(err, callback)) return;
                        questionModule = ret_questionModule;
                        callback(null);
                    });
                },
                (callback) => {
                    questionModule.parse(submission, variant, question, course, (err, ret_courseErrs, ret_data) => {
                        if (ERR(err, callback)) return;
                        courseErrs = ret_courseErrs;
                        data = ret_data;
                        callback(null);
                    });
                },
                (callback) => {
                    const studentMessage = 'Error parsing submission';
                    const courseData = {variant, question, submission, course};
                    module.exports.writeCourseErrs(client, courseErrs, variant.id, submission.auth_user_id, studentMessage, courseData, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
                (callback) => {
                    const hasFatalError = _.some(_.map(courseErrs, 'fatal'));
                    if (hasFatalError) data.gradable = false;

                    const params = [
                        data.submitted_answer,
                        data.raw_submitted_answer,
                        data.parse_errors,
                        data.gradable,
                        submission.type,
                        submission.credit,
                        submission.mode,
                        submission.variant_id,
                        submission.auth_user_id,
                    ];
                    sqldb.callWithClientOneRow(client, 'submissions_insert', params, (err, result) => {
                        if (ERR(err, callback)) return;
                        submission_id = result.rows[0].submission_id;
                        callback(null);
                    });
                },
            ], function(err) {
                sqldb.endTransaction(client, done, err, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null, submission_id);
                });
            });
        });
    },
    
    /**
     * Grade the most recent submission for a given variant.
     * 
     * @param {Object} variant - The variant to grade.
     * @param {?number} check_submission_id - The submission_id that must be graded (or null to skip this check).
     * @param {Object} question - The question for the variant.
     * @param {Object} course - The course for the variant.
     * @param {number} authn_user_id - The currently authenticated user.
     * @param {function} callback - The callback(err) function.
     */
    gradeVariant: function(variant, check_submission_id, question, course, authn_user_id, callback) {
        let questionModule, courseErrs, data, submission, grading_job;
        sqldb.beginTransaction(function(err, client, done) {
            if (ERR(err, callback)) return;
            async.series([
                (callback) => {
                    sqldb.callWithClient(client, 'variants_lock', [variant.id], (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
                (callback) => {
                    var params = [
                        variant.id,
                        check_submission_id,
                    ];
                    sqldb.callWithClientZeroOrOneRow(client, 'variants_select_submission_for_grading', params, (err, result) => {
                        if (ERR(err, callback)) return;
                        if (result.rowCount == 0) return callback(new NoSubmissionError());
                        submission = result.rows[0];
                        callback(null);
                    });
                },
                (callback) => {
                    questionServers.getModule(question.type, function(err, ret_questionModule) {
                        if (ERR(err, callback)) return;
                        questionModule = ret_questionModule;
                        callback(null);
                    });
                },
                (callback) => {
                    if (question.grading_method == 'Internal') {
                        // for Internal grading we call the grading code
                        questionModule.grade(submission, variant, question, course, function(err, ret_courseErrs, ret_data) {
                            if (ERR(err, callback)) return;
                            courseErrs = ret_courseErrs;
                            data = ret_data;
                            const hasFatalError = _.some(_.map(courseErrs, 'fatal'));
                            if (hasFatalError) data.gradable = false;
                            callback(null);
                        });
                    } else {
                        // for External or Manual grading we don't do anything
                        courseErrors = [];
                        data = {};
                        callback(null);
                    }
                },
                (callback) => {
                    const studentMessage = 'Error grading submission';
                    const courseData = {variant, question, submission, course};
                    module.exports.writeCourseErrs(client, courseErrs, variant.id, submission.auth_user_id, studentMessage, courseData, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
                (callback) => {
                    const params = [
                        submission.id,
                        authn_user_id,
                        data.gradable,
                        data.errors,
                        data.partial_scores,
                        data.score,
                        data.feedback,
                        data.submitted_answer,
                        data.params,
                        data.true_answer,
                    ];
                    sqldb.callWithClientOneRow(client, 'grading_jobs_insert', params, function(err, result) {
                        if (ERR(err, callback)) return;
                        grading_job = result.rows[0];
                        callback(null);
                    });
                },
                (callback) => {
                    if (grading_job.grading_method == 'External') {
                        messageQueue.sendToGradingQueue(submit_grading_job_id, submission, variant, question, course);
                    }
                    callback(null);
                },
            ], function(err) {
                // catch NoSubmissionError as we are just using it to exit with no action
                if (err instanceof NoSubmissionError) err = null;
                sqldb.endTransaction(client, done, err, function(err) {
                    if (ERR(err, callback)) return;

                    if (question.grading_method == 'External') {
                    } else {
                        callback(null);
                    }
                });
            });
        });
    },

    getVariant: function(req, res, variant_id, assessmentType, callback) {
        res.locals.showSubmitButton = false;
        res.locals.showSaveButton = false;
        res.locals.showNewVariantButton = false;
        res.locals.showSubmissions = false;
        res.locals.showFeedback = false;
        res.locals.showTrueAnswer = false;
        res.locals.showGradingRequested = false;
        res.locals.allowAnswerEditing = false;
        res.locals.submissions = [];

        if (assessmentType == 'Homework') {
            res.locals.showSubmitButton = true;
            res.locals.allowAnswerEditing = true;
        }
        if (assessmentType == 'Exam') {
            if (res.locals.assessment_instance.open) {
                if (res.locals.instance_question.open) {
                    res.locals.showSaveButton = true;
                    res.locals.allowAnswerEditing = true;
                }
            } else {
                res.locals.showTrueAnswer = true;
            }
        }

        async.series([
            function(callback) {
                if (variant_id) {
                    var params = {
                        variant_id: variant_id,
                        instance_question_id: res.locals.instance_question.id,
                    };
                    sqldb.queryOneRow(sql.select_variant_for_instance_question, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        res.locals.variant = result.rows[0];
                        callback(null);
                    });
                } else {
                    sqldb.beginTransaction(function(err, client, done) {
                        if (ERR(err, callback)) return;

                        const require_open = (assessmentType != 'Exam');
                        const instance_question_id = res.locals.instance_question ? res.locals.instance_question.id : null;
                        module.exports.ensureVariant(client, instance_question_id, res.locals.user.user_id, res.locals.authn_user.user_id, res.locals.question, res.locals.course, {}, require_open, function(err, variant) {
                            if (ERR(err, callback)) return;
                            res.locals.variant = variant;

                            sqldb.endTransaction(client, done, err, function(err) {
                                if (ERR(err, callback)) return;
                                callback(null);
                            });
                        });
                    });
                }
            },
            function(callback) {
                var params = {
                    variant_id: res.locals.variant.id,
                    req_date: res.locals.req_date,
                };
                sqldb.query(sql.select_submissions, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    if (result.rowCount >= 1) {
                        res.locals.submissions = result.rows;
                        res.locals.submission = res.locals.submissions[0]; // most recent submission

                        res.locals.showSubmissions = true;
                        res.locals.showFeedback = true;
                        if (assessmentType == 'Homework' && !res.locals.question.single_variant) {
                            res.locals.showSubmitButton = false;
                            res.locals.showNewVariantButton = true;
                            res.locals.showTrueAnswer = true;
                            res.locals.allowAnswerEditing = false;
                        }
                    }
                    callback(null);
                });
            },
            function(callback) {
                questionServers.getEffectiveQuestionType(res.locals.question.type, function(err, eqt) {
                    if (ERR(err, callback)) return;
                    res.locals.effectiveQuestionType = eqt;
                    callback(null);
                });
            },
            function(callback) {
                res.locals.paths = {};
                res.locals.paths.clientFilesQuestion = res.locals.urlPrefix + '/instance_question/' + res.locals.instance_question.id + '/clientFilesQuestion';
                callback(null);
            },
            function(callback) {
                const renderSelection = {
                    'header': res.locals.variant.valid,
                    'question': res.locals.variant.valid,
                    'submissions': res.locals.variant.valid && res.locals.showSubmissions,
                    'answer': res.locals.variant.valid && res.locals.showTrueAnswer,
                };
                module.exports.render(renderSelection, res.locals.variant, res.locals.question, res.locals.submission, res.locals.submissions, res.locals.course, res.locals, function(err, htmls) {
                    if (ERR(err, callback)) return;
                    res.locals.extraHeadersHtml = htmls.extraHeadersHtml;
                    res.locals.questionHtml = htmls.questionHtml;
                    res.locals.submissionHtmls = htmls.submissionHtmls;
                    res.locals.answerHtml = htmls.answerHtml;
                    callback(null);
                });
            },
            function(callback) {
                // load errors last in case there are errors from rendering
                const params = {
                    variant_id: res.locals.variant.id,
                };
                sqldb.query(sql.select_errors, params, (err, result) => {
                    if (ERR(err, callback)) return;
                    res.locals.errors = result.rows;
                    callback(null);
                });
            },
            function(callback) {
                var questionJson = JSON.stringify({
                    questionFilePath: res.locals.urlPrefix + '/instance_question/' + res.locals.instance_question.id + '/file',
                    questionGeneratedFilePath: res.locals.urlPrefix + '/instance_question/' + res.locals.instance_question.id + '/generatedFilesQuestion/variant/' + res.locals.variant.id,
                    question: res.locals.question,
                    effectiveQuestionType: res.locals.effectiveQuestionType,
                    course: res.locals.course,
                    courseInstance: res.locals.course_instance,
                    variant: {
                        id: res.locals.variant.id,
                        params: res.locals.variant.params,
                    },
                    submittedAnswer: (res.locals.showSubmissions && res.locals.submission) ? res.locals.submission.submitted_answer : null,
                    feedback: (res.locals.showFeedback && res.locals.submission) ? res.locals.submission.feedback : null,
                    trueAnswer: res.locals.showTrueAnswer ? res.locals.variant.true_answer : null,
                    submissions : res.locals.showSubmissions ? res.locals.submissions : null,
                });
                var encodedJson = encodeURIComponent(questionJson);
                res.locals.questionJsonBase64 = (new Buffer(encodedJson)).toString('base64');
                res.locals.video = null;
                callback(null);
            },
        ], function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
};
