var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var ejs = require('ejs');

var error = require('../lib/error');
var logger = require('../lib/logger');
var sqldb = require('../lib/sqldb');
var question = require('../lib/question');
var externalGradingSocket = require('../lib/external-grading-socket');

/**
 * Assessment module.
 * @module assessment
 */

module.exports = {

    /**
     * Render the "text" property of an assessment.
     *
     * @param {Object} assessment - The assessment to render the text for.
     * @param {string} urlPrefix - The current server urlPrefix.
     * @param {function} callback - A callback(err, html) function.
     */
    renderText(assessment, urlPrefix, callback) {
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

    /*
     * Create a new assessment instance and all the questions in it.
     *
     * @param {number} assessment_id - The assessment to create the assessment instance for.
     * @param {number} user_id - The user who will own the new assessment instance.
     * @param {number} authn_user_id - The current authenticated user.
     * @param {string} mode - The mode for the new assessment instance.
     * @param {?number} time_limit_min - The time limit for the new assessment instance.
     * @param {Date} date - The date of creation for the new assessment instance.
     * @param {Object} course - The course for the new assessment instance.
     * @param {function} callback - A callback(err, assessment_instance_id) function.
     */
    makeAssessmentInstance(assessment_id, user_id, authn_user_id, mode, time_limit_min, date, course, callback) {
        sqldb.beginTransaction((err, client, done) => {
            if (ERR(err, callback)) return;

            var assessment_instance_id, new_instance_question_ids;
            async.series([
                (callback) => {
                    var params = [
                        assessment_id,
                        user_id,
                        authn_user_id,
                        mode,
                        time_limit_min,
                        date,
                    ];
                    sqldb.callWithClientOneRow(client, 'assessment_instances_insert', params, (err, result) => {
                        if (ERR(err, callback)) return;
                        assessment_instance_id = result.rows[0].assessment_instance_id;
                        new_instance_question_ids = result.rows[0].new_instance_question_ids;
                        callback(null);
                    });
                },
                (callback) => {
                    async.each(new_instance_question_ids, (instance_question_id, callback) => {
                        const options = {};
                        const require_open = true;
                        question._ensureVariantWithClient(client, instance_question_id, user_id, authn_user_id, course, options, require_open, (err, _variant) => {
                            if (ERR(err, callback)) return;
                            callback(null);
                        });
                    }, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
            ], (err) => {
                sqldb.endTransaction(client, done, err, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null, assessment_instance_id);
                });
            });
        });
    },

    /*
     * Add new questions to the assessment instance and regrade it if necessary.
     *
     * @param {number} assessment_instance_id - The assessment instance to grade.
     * @param {number} authn_user_id - The current authenticated user.
     * @param {function} callback - A callback(err, updated) function.
     */
    update(assessment_instance_id, authn_user_id, callback) {
        let updated;
        sqldb.beginTransaction((err, client, done) => {
            if (ERR(err, callback)) return;
            async.series([
                (callback) => {
                    sqldb.callWithClient(client, 'assessment_instances_lock', [assessment_instance_id], (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
                (callback) => {
                    const params = [
                        assessment_instance_id,
                        authn_user_id,
                    ];
                    sqldb.callOneRow('assessment_instances_update', params, (err, result) => {
                        if (ERR(err, callback)) return;
                        updated = result.rows[0].updated;
                        callback(null);
                    });
                },
                (callback) => {
                    if (!updated) return callback(null); // skip if not updated

                    // if updated, regrade to pick up max_points changes, etc.
                    const params = [
                        assessment_instance_id,
                        authn_user_id,
                        null, // credit
                        true, // only_log_if_score_updated
                    ];
                    sqldb.callOneRow('assessment_instances_grade', params, (err, _result) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
            ], (err) => {
                sqldb.endTransaction(client, done, err, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null, updated);
                });
            });
        });
    },

    /*
     * Internal worker for gradeVariant(). Do not call directly.
     * @protected
     *
     * @param {Object} client - SQL client that must be inside a locked transaction.
     * @param {number} assessment_instance_id - The assessment instance to grade.
     * @param {number} authn_user_id - The current authenticated user.
     * @param {boolean} close - Whether to close the assessment instance after grading.
     * @param {function} callback - A callback(err) function.
     */
    _gradeAssessmentInstanceWithClient(client, assessment_instance_id, authn_user_id, close, callback) {
        let rows;
        async.series([
            (callback) => {
                sqldb.callWithClient('variants_select_for_assessment_instance', [assessment_instance_id], (err, result) => {
                    if (ERR(err, callback)) return;
                    rows = result.rows;
                    callback(null);
                });
            },
            (callback) => {
                async.eachSeries(rows, (row, callback) => {
                    const check_submission_id = null;
                    question._gradeVariantWithClient(client, row.variant, check_submission_id, row.question, row.course, authn_user_id, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                if (!close) return callback(null);
                sqldb.callWithClient('assessment_instances_close', [assessment_instance_id], (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
        ], (err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },

    /**
     * Grade all questions in an assessment instance and (optionally) close it.
     * 
     * @param {number} assessment_instance_id - The assessment instance to grade.
     * @param {number} authn_user_id - The current authenticated user.
     * @param {boolean} close - Whether to close the assessment instance after grading.
     * @param {function} callback - A callback(err) function.
     */
    gradeAssessmentInstance(assessment_instance_id, authn_user_id, close, callback) {
        sqldb.beginTransaction((err, client, done) => {
            if (ERR(err, callback)) return;
            async.series([
                (callback) => {
                    sqldb.callWithClient(client, 'assessment_instances_lock', [assessment_instance_id], (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
                (callback) => {
                    this._gradeAssessmentInstance(client, assessment_instance_id, authn_user_id, close, (err) => {
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
     * Process the result of an external grading job.
     * 
     * @param {Obect} content - The grading job data to process.
     */
    processGradingResult(content) {
        async.series([
            (callback) => {
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
                    content.gradingId,
                    content.grading.score,
                    content.grading.feedback,
                    content.grading.startTime,
                    content.grading.endTime,
                ];
                sqldb.call('grading_jobs_process_external', params, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
        ], (err) => {
            if (ERR(err, () => {})) {
                // FIXME: call sprocs/errors_insert here
                logger.error('processGradingResult: error',
                             {message: err.message, stack: err.stack, data: JSON.stringify(err.data)});
            }
            externalGradingSocket.gradingLogStatusUpdated(content.gradingId);
        });
    },
};
