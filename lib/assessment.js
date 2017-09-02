var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var ejs = require('ejs');
var path = require('path');
var debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

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
                        const question_id = null; // use instance_question_id to determine the question
                        const options = {};
                        const require_open = true;
                        question._ensureVariantWithClient(client, question_id, instance_question_id, user_id, authn_user_id, course, options, require_open, (err, _variant) => {
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
        debug('update()');
        let updated;
        sqldb.beginTransaction((err, client, done) => {
            if (ERR(err, callback)) return;
            debug('inside transaction');
            async.series([
                (callback) => {
                    sqldb.callWithClient(client, 'assessment_instances_lock', [assessment_instance_id], (err) => {
                        if (ERR(err, callback)) return;
                        debug('locked');
                        callback(null);
                    });
                },
                (callback) => {
                    const params = [
                        assessment_instance_id,
                        authn_user_id,
                    ];
                    sqldb.callWithClientOneRow(client, 'assessment_instances_update', params, (err, result) => {
                        if (ERR(err, callback)) return;
                        updated = result.rows[0].updated;
                        debug('updated:', updated);
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
                    sqldb.callWithClientOneRow(client, 'assessment_instances_grade', params, (err, _result) => {
                        if (ERR(err, callback)) return;
                        debug('graded');
                        callback(null);
                    });
                },
            ], (err) => {
                sqldb.endTransaction(client, done, err, (err) => {
                    if (ERR(err, callback)) return;
                    debug('transaction ended');
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
        debug('_gradeAssessmentInstanceWithClient()');
        let rows;
        async.series([
            (callback) => {
                sqldb.callWithClient(client, 'variants_select_for_assessment_instance_grading', [assessment_instance_id], (err, result) => {
                    if (ERR(err, callback)) return;
                    rows = result.rows;
                    debug('_gradeAssessmentInstanceWithClient()', 'selected variants', 'count:', rows.length);
                    callback(null);
                });
            },
            (callback) => {
                async.eachSeries(rows, (row, callback) => {
                    debug('_gradeAssessmentInstanceWithClient()', 'loop', 'variant.id:', row.variant.id);
                    const check_submission_id = null;
                    question._gradeVariantWithClient(client, row.variant, check_submission_id, row.question, row.course, authn_user_id, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                }, (err) => {
                    if (ERR(err, callback)) return;
                    debug('_gradeAssessmentInstanceWithClient()', 'finished grading');
                    callback(null);
                });
            },
            (callback) => {
                if (!close) return callback(null);
                sqldb.callWithClient(client, 'assessment_instances_close', [assessment_instance_id, authn_user_id], (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
        ], (err) => {
            if (ERR(err, callback)) return;
            debug('_gradeAssessmentInstanceWithClient()', 'success');
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
        debug('gradeAssessmentInstance()');
        sqldb.beginTransaction((err, client, done) => {
            if (ERR(err, callback)) return;
            async.series([
                (callback) => {
                    sqldb.callWithClient(client, 'assessment_instances_lock', [assessment_instance_id], (err) => {
                        if (ERR(err, callback)) return;
                        debug('gradeAssessmentInstance()', 'locked');
                        callback(null);
                    });
                },
                (callback) => {
                    this._gradeAssessmentInstanceWithClient(client, assessment_instance_id, authn_user_id, close, (err) => {
                        if (ERR(err, callback)) return;
                        debug('gradeAssessmentInstance()', 'finished _gradeAssessmentInstanceWithClient()');
                        callback(null);
                    });
                },
            ], (err) => {
                sqldb.endTransaction(client, done, err, (err) => {
                    if (ERR(err, callback)) return;
                    debug('gradeAssessmentInstance()', 'success');
                    callback(null);
                });
            });
        });
    },

    /**
     * Generates an object that can be passed to assessment.processGradingResult.
     * This function can be passed a parsed results object, or it can be passed a
     * string or buffer to attempt to parse it and mark the grading job as failed when
     * parsing fails.
     *
     * @param {Object|string} data - The grading results
     */
    makeGradingResult(data) {
        if (typeof data === 'string' || Buffer.isBuffer(data)) {
            try {
                data = JSON.parse(data);
            } catch (e) {
                return {
                    gradingId: data.job_id,
                    grading: {
                        score: 0,
                        startTime: null,
                        endTime: null,
                        feedback: {
                            succeeded: false,
                        },
                    },
                };
            }
        }

        if (!data.succeeded) {
            return {
                gradingId: data.job_id,
                grading: {
                    startTime: data.start_time || null,
                    endTime: data.end_time || null,
                    score: 0,
                    feedback: data
                }
            };
        }

        // TODO: once we have better error handling in place, account for these errors
        /*
        if (!data.results) {
            return callback(new Error('results.json did not contain \'results\' object.'));
        }

        if (typeof data.results.score !== 'number' || Number.isNaN(data.results.score)) {
            return callback(new Error('Score did not exist or is not a number!'));
        }
        */

        let score = 0.0;
        if (data.results && typeof data.results.score === 'number' && !Number.isNaN(data.results.score)) {
            score = data.results.score;
        }

        return {
            gradingId: data.job_id,
            grading: {
                startTime: data.start_time,
                endTime: data.end_time,
                score: score,
                feedback: data
            }
        };
    },

    /**
     * Process the result of an external grading job.
     *
     * @param {Obect} content - The grading job data to process.
     */
    processGradingResult(content) {
        console.log(content);
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
