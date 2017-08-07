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

/**
 * Internal error type for tracking lack of submission.
 */
class NoSubmissionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NoSubmissionError';
  }
}

module.exports = {
    /**
     * Internal function, do not call directly. Write the courseErrs for a variant to the DB.
     * @protected
     *
     * @param {Object} client - SQL client that must be inside a locked transaction.
     * @param {Array} courseErrs - List of Error() objects for to be written.
     * @param {number} variant_id - The variant associated with the errors.
     * @param {number} authn_user_id - The currently authenticated user.
     * @param {string} studentMessage - The error message to display to the student.
     * @param {Object} courseData - Arbitrary data to be associated with the errors.
     * @param {function} callback - A callback(err) function.
     */
    _writeCourseErrs(client, courseErrs, variant_id, authn_user_id, studentMessage, courseData, callback) {
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

    /**
     * Internal function, do not call directly. Create a variant object, do not write to DB.
     * @protected
     *
     * @param {Object} question - The question for the variant.
     * @param {Object} course - The course for the variant.
     * @param {Object} options - Options controlling the creation: options = {variant_seed}
     * @param {function} callback - A callback(err, courseErrs, variant) function.
     */
    _makeVariant(question, course, options, callback) {
        var variant_seed;
        if (_(options).has('variant_seed')) {
            variant_seed = options.variant_seed;
        } else {
            variant_seed = Math.floor(Math.random() * Math.pow(2, 32)).toString(36);
        }
        questionServers.getModule(question.type, (err, questionModule) => {
            if (ERR(err, callback)) return;
            questionModule.generate(question, course, variant_seed, (err, courseErrs, data) => {
                if (ERR(err, callback)) return;
                const hasFatalError = _.some(_.map(courseErrs, 'fatal'));
                var variant = {
                    variant_seed: variant_seed,
                    params: data.params || {},
                    true_answer: data.true_answer || {},
                    options: data.options || {},
                    broken: hasFatalError,
                };
                if (hasFatalError) {
                    return callback(null, courseErrs, variant);
                }
                questionModule.prepare(question, course, variant, (err, extraCourseErrs, data) => {
                    if (ERR(err, callback)) return;
                    courseErrs.push(...extraCourseErrs);
                    const hasFatalError = _.some(_.map(courseErrs, 'fatal'));
                    var variant = {
                        variant_seed: variant_seed,
                        params: data.params || {},
                        true_answer: data.true_answer || {},
                        options: data.options || {},
                        broken: hasFatalError,
                    };
                    callback(null, courseErrs, variant);
                });
            });
        });
    },

    /**
     * Internal function, do not call directly. Create a variant object, and write it to the DB.
     * @protected
     *
     * @param {Object} client - SQL client that must be inside a locked transaction.
     * @param {number} instance_question_id - The instance question for the new variant.
     * @param {number} user_id - The user for the new variant.
     * @param {number} authn_user_id - The current authenticated user.
     * @param {Object} course - The course for the variant.
     * @param {Object} options - Options controlling the creation: options = {variant_seed}
     * @param {function} callback - A callback(err, variant) function.
     */
    _makeAndInsertVariantWithClient(client, instance_question_id, user_id, authn_user_id, course, options, callback) {
        sqldb.callWithClientOneRow('instance_questions_select_question', [instance_question_id], (err, result) => {
            if (ERR(err, callback)) return;
            const question = result.rows[0];
            this._makeVariant(question, course, options, (err, courseErrs, variant) => {
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
                    this._writeCourseErrs(client, courseErrs, variant.id, authn_user_id, studentMessage, courseData, (err) => {
                        if (ERR(err, callback)) return;
                        return callback(null, variant);
                    });
                });
            });
        });
    },

    /**
     * Internal function, do not call directly. Make sure there is a variant for an instance question.
     * @protected
     *
     * @param {Object} client - SQL client that must be inside a locked transaction.
     * @param {?number} instance_question_id - The instance question for the new variant.
     * @param {number} user_id - The user for the new variant.
     * @param {number} authn_user_id - The current authenticated user.
     * @param {Object} course - The course for the variant.
     * @param {Object} options - Options controlling the creation: options = {variant_seed}
     * @param {boolean} require_open - If true, only use an existing variant if it is open.
     * @param {function} callback - A callback(err, variant) function.
     */
    _ensureVariantWithClient(client, instance_question_id, user_id, authn_user_id, course, options, require_open, callback) {
        if (instance_question_id != null) {
            // if we have an existing variant that is open then use
            // that one, otherwise make a new one
            var params = {
                instance_question_id: instance_question_id,
                require_open: require_open,
            };
            sqldb.queryWithClient(client, sql.get_open_variant, params, (err, result) => {
                if (ERR(err, callback)) return;
                if (result.rowCount == 1) {
                    const variant = result.rows[0];
                    return callback(null, variant);
                }
                this._makeAndInsertVariantWithClient(client, instance_question_id, user_id, authn_user_id, course, options, (err, variant) => {
                    if (ERR(err, callback)) return;
                    callback(null, variant);
                });
            });
        } else {
            // if we don't have instance_question_id, just make a new variant
            this._makeAndInsertVariantWithClient(client, instance_question_id, user_id, authn_user_id, course, options, (err, variant) => {
                if (ERR(err, callback)) return;
                callback(null, variant);
            });
        }
    },

    /**
     * Ensure that there is a variant for the given instance question.
     *
     * @param {?number} instance_question_id - The instance question for the new variant, or null for a floating variant.
     * @param {number} user_id - The user for the new variant.
     * @param {number} authn_user_id - The current authenticated user.
     * @param {Object} course - The course for the variant.
     * @param {Object} options - Options controlling the creation: options = {variant_seed}
     * @param {boolean} require_open - If true, only use an existing variant if it is open.
     * @param {function} callback - A callback(err, variant) function.
     */
    ensureVariant(instance_question_id, user_id, authn_user_id, course, options, require_open, callback) {
        let variant;
        sqldb.beginTransaction((err, client, done) => {
            if (ERR(err, callback)) return;
            async.series([
                (callback) => {
                    if (instance_question_id == null) return callback(null); // no locking in this case
                    sqldb.callWithClient(client, 'instance_questions_lock', [instance_question_id], (err) => {
                        if (ERR(err, callback)) return;
                        callback(null, variant);
                    });
                },
                (callback) => {
                    this._ensureVariantWithClient(client, instance_question_id, user_id, authn_user_id, course, options, require_open, (err, ret_variant) => {
                        if (ERR(err, callback)) return;
                        variant = ret_variant;
                        callback(null);
                    });
                },
            ], (err) => {
                sqldb.endTransaction(client, done, err, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null, variant);
                });
            });
        });
    },

    /*
     * Internal worker for saveSubmission(). Do not call directly.
     * @protected
     * 
     * @param {Object} client - SQL client that must be inside a locked transaction.
     * @param {Object} submission - The submission to save (should not have an id property yet).
     * @param {Object} variant - The variant to submit to.
     * @param {Object} question - The question for the variant.
     * @param {Object} course - The course for the variant.
     * @param {function} callback - A callback(err, submission_id) function.
     */
    _saveSubmissionWithClient(client, submission, variant, question, course, callback) {
        let questionModule, courseErrs, data, submission_id;
        async.series([
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
                this._writeCourseErrs(client, courseErrs, variant.id, submission.auth_user_id, studentMessage, courseData, (err) => {
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
        ], (err) => {
            if (ERR(err, callback)) return;
            callback(null, submission_id);
        });
    },

    /**
     * Save a new submission to a variant into the database.
     * 
     * @param {Object} submission - The submission to save (should not have an id property yet).
     * @param {Object} variant - The variant to submit to.
     * @param {Object} question - The question for the variant.
     * @param {Object} course - The course for the variant.
     * @param {function} callback - A callback(err, submission_id) function.
     */
    saveSubmission(submission, variant, question, course, callback) {
        let submission_id;
        sqldb.beginTransaction((err, client, done) => {
            if (ERR(err, callback)) return;
            async.series([
                (callback) => {
                    sqldb.callWithClient(client, 'variants_lock', [variant.id], (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
                (callback) => {
                    this._saveSubmissionWithClient(client, submission, variant, question, course, (err, ret_submission_id) => {
                        if (ERR(err, callback)) return;
                        submission_id = ret_submission_id;
                        callback(null);
                    });
                },
            ], (err) => {
                sqldb.endTransaction(client, done, err, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null, submission_id);
                });
            });
        });
    },

    /**
     * Internal worker for gradeVariant(). Do not call directly.
     * @protected
     *
     * @param {Object} client - SQL client that must be inside a locked transaction.
     * @param {Object} variant - The variant to grade.
     * @param {?number} check_submission_id - The submission_id that must be graded (or null to skip this check).
     * @param {Object} question - The question for the variant.
     * @param {Object} course - The course for the variant.
     * @param {number} authn_user_id - The currently authenticated user.
     * @param {function} callback - A callback(err) function.
     */
    _gradeVariantWithClient(client, variant, check_submission_id, question, course, authn_user_id, callback) {
        let questionModule, courseErrs, data, submission, grading_job;
        async.series([
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
                questionServers.getModule(question.type, (err, ret_questionModule) => {
                    if (ERR(err, callback)) return;
                    questionModule = ret_questionModule;
                    callback(null);
                });
            },
            (callback) => {
                if (question.grading_method == 'Internal') {
                    // for Internal grading we call the grading code
                    questionModule.grade(submission, variant, question, course, (err, ret_courseErrs, ret_data) => {
                        if (ERR(err, callback)) return;
                        courseErrs = ret_courseErrs;
                        data = ret_data;
                        const hasFatalError = _.some(_.map(courseErrs, 'fatal'));
                        if (hasFatalError) data.gradable = false;
                        callback(null);
                    });
                } else {
                    // for External or Manual grading we don't do anything
                    courseErrs = [];
                    data = {};
                    callback(null);
                }
            },
            (callback) => {
                const studentMessage = 'Error grading submission';
                const courseData = {variant, question, submission, course};
                this._writeCourseErrs(client, courseErrs, variant.id, submission.auth_user_id, studentMessage, courseData, (err) => {
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
                sqldb.callWithClientOneRow(client, 'grading_jobs_insert', params, (err, result) => {
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
        ], (err) => {
            // catch NoSubmissionError as we are just using it to exit with no action
            if (err instanceof NoSubmissionError) err = null;
            if (ERR(err, callback)) return;
            callback(null);
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
     * @param {function} callback - A callback(err) function.
     */
    gradeVariant(variant, check_submission_id, question, course, authn_user_id, callback) {
        sqldb.beginTransaction((err, client, done) => {
            if (ERR(err, callback)) return;
            async.series([
                (callback) => {
                    sqldb.callWithClient(client, 'variants_lock', [variant.id], (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
                (callback) => {
                    this._gradeVariantWithClient(client, variant, check_submission_id, question, course, authn_user_id, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
            ], (err) => {
                sqldb.endTransaction(client, done, err, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        });
    },

    /**
     * Save and grade a new submission to a variant.
     * 
     * @param {Object} submission - The submission to save (should not have an id property yet).
     * @param {Object} variant - The variant to submit to.
     * @param {Object} question - The question for the variant.
     * @param {Object} course - The course for the variant.
     * @param {function} callback - A callback(err, submission_id) function.
     */
    saveAndGradeSubmission(submission, variant, question, course, callback) {
        let submission_id;
        sqldb.beginTransaction((err, client, done) => {
            if (ERR(err, callback)) return;
            async.series([
                (callback) => {
                    sqldb.callWithClient(client, 'variants_lock', [variant.id], (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
                (callback) => {
                    this._saveSubmissionWithClient(client, submission, variant, question, course, (err, ret_submission_id) => {
                        if (ERR(err, callback)) return;
                        submission_id = ret_submission_id;
                        callback(null);
                    });
                },
                (callback) => {
                    this._gradeVariantWithClient(client, variant, submission_id, question, course, authn_user_id, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
            ], (err) => {
                sqldb.endTransaction(client, done, err, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null, submission_id);
                });
            });
        });
    },

    /**
     * Internal worker. Do not call directly. Renders the HTML for a variant.
     * @protected
     *
     * @param {Object} renderSelection - Specify which panels should be rendered.
     * @param {Object} variant - The variant to submit to.
     * @param {Object} question - The question for the variant.
     * @param {Object} submission - The current submission to the variant.
     * @param {Array} submissions - The full list of submissions to the variant.
     * @param {Object} course - The course for the variant.
     * @param {Object} locals - The current locals for the page response.
     * @param {function} callback - A callback(err, courseErrs, htmls) function.
     */
    _render(renderSelection, variant, question, submission, submissions, course, locals, callback) {
        questionServers.getModule(question.type, (err, questionModule) => {
            if (ERR(err, callback)) return;
            questionModule.render(renderSelection, variant, question, submission, submissions, course, locals, (err, courseErrs, htmls) => {
                if (ERR(err, callback)) return;
                
                const studentMessage = 'Error rendering question';
                const courseData = {variant, question, submission, course};
                this._writeCourseErrs(null, courseErrs, variant.id, locals.authn_user.user_id, studentMessage, courseData, (err) => {
                    if (ERR(err, callback)) return;
                    return callback(null, htmls);
                });
            });
        });
    },

    /**
     * Render all information needed for a question.
     * 
     * @param {?number} variant_id - The variant to render, or null if it should be generated.
     * @param {Object} locals - The current locals structure to read/write.
     * @param {function} callback - A callback(err) function.
     */
    getAndRenderVariant(variant_id, locals, callback) {
        locals.showSubmitButton = false;
        locals.showSaveButton = false;
        locals.showNewVariantButton = false;
        locals.showSubmissions = false;
        locals.showFeedback = false;
        locals.showTrueAnswer = false;
        locals.showGradingRequested = false;
        locals.allowAnswerEditing = false;
        locals.submissions = [];

        if (locals.assessment.type == 'Homework') {
            locals.showSubmitButton = true;
            locals.allowAnswerEditing = true;
        }
        if (locals.assessment.type == 'Exam') {
            if (locals.assessment_instance.open) {
                if (locals.instance_question.open) {
                    locals.showSaveButton = true;
                    locals.allowAnswerEditing = true;
                }
            } else {
                locals.showTrueAnswer = true;
            }
        }

        async.series([
            (callback) => {
                if (variant_id != null) {
                    var params = {
                        variant_id: variant_id,
                        instance_question_id: locals.instance_question.id,
                    };
                    sqldb.queryOneRow(sql.select_variant_for_instance_question, params, (err, result) => {
                        if (ERR(err, callback)) return;
                        locals.variant = result.rows[0];
                        callback(null);
                    });
                } else {
                    const require_open = (locals.assessment.type != 'Exam');
                    const instance_question_id = locals.instance_question ? locals.instance_question.id : null;
                    this.ensureVariant(instance_question_id, locals.user.user_id, locals.authn_user.user_id, locals.course, {}, require_open, (err, variant) => {
                        if (ERR(err, callback)) return;
                        locals.variant = variant;
                        callback(null);
                    });
                }
            },
            (callback) => {
                var params = {
                    variant_id: locals.variant.id,
                    req_date: locals.req_date,
                };
                sqldb.query(sql.select_submissions, params, (err, result) => {
                    if (ERR(err, callback)) return;
                    if (result.rowCount >= 1) {
                        locals.submissions = result.rows;
                        locals.submission = locals.submissions[0]; // most recent submission

                        locals.showSubmissions = true;
                        locals.showFeedback = true;
                        if (locals.assessment.type == 'Homework' && !locals.question.single_variant) {
                            locals.showSubmitButton = false;
                            locals.showNewVariantButton = true;
                            locals.showTrueAnswer = true;
                            locals.allowAnswerEditing = false;
                        }
                    }
                    callback(null);
                });
            },
            (callback) => {
                questionServers.getEffectiveQuestionType(locals.question.type, (err, eqt) => {
                    if (ERR(err, callback)) return;
                    locals.effectiveQuestionType = eqt;
                    callback(null);
                });
            },
            (callback) => {
                locals.paths = {};
                locals.paths.clientFilesQuestion = locals.urlPrefix + '/instance_question/' + locals.instance_question.id + '/clientFilesQuestion';
                callback(null);
            },
            (callback) => {
                const renderSelection = {
                    'header': locals.variant.valid,
                    'question': locals.variant.valid,
                    'submissions': locals.variant.valid && locals.showSubmissions,
                    'answer': locals.variant.valid && locals.showTrueAnswer,
                };
                this.render(renderSelection, locals.variant, locals.question, locals.submission, locals.submissions, locals.course, locals, (err, htmls) => {
                    if (ERR(err, callback)) return;
                    locals.extraHeadersHtml = htmls.extraHeadersHtml;
                    locals.questionHtml = htmls.questionHtml;
                    locals.submissionHtmls = htmls.submissionHtmls;
                    locals.answerHtml = htmls.answerHtml;
                    callback(null);
                });
            },
            (callback) => {
                // load errors last in case there are errors from rendering
                const params = {
                    variant_id: locals.variant.id,
                };
                sqldb.query(sql.select_errors, params, (err, result) => {
                    if (ERR(err, callback)) return;
                    locals.errors = result.rows;
                    callback(null);
                });
            },
            (callback) => {
                var questionJson = JSON.stringify({
                    questionFilePath: locals.urlPrefix + '/instance_question/' + locals.instance_question.id + '/file',
                    questionGeneratedFilePath: locals.urlPrefix + '/instance_question/' + locals.instance_question.id + '/generatedFilesQuestion/variant/' + locals.variant.id,
                    question: locals.question,
                    effectiveQuestionType: locals.effectiveQuestionType,
                    course: locals.course,
                    courseInstance: locals.course_instance,
                    variant: {
                        id: locals.variant.id,
                        params: locals.variant.params,
                    },
                    submittedAnswer: (locals.showSubmissions && locals.submission) ? locals.submission.submitted_answer : null,
                    feedback: (locals.showFeedback && locals.submission) ? locals.submission.feedback : null,
                    trueAnswer: locals.showTrueAnswer ? locals.variant.true_answer : null,
                    submissions : locals.showSubmissions ? locals.submissions : null,
                });
                var encodedJson = encodeURIComponent(questionJson);
                locals.questionJsonBase64 = (new Buffer(encodedJson)).toString('base64');
                locals.video = null;
                callback(null);
            },
        ], (err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
};
