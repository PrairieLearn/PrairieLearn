const ERR = require('async-stacktrace');
const _ = require('lodash');
const async = require('async');
const ejs = require('ejs');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const error = require('@prairielearn/prairielib/error');
const logger = require('../lib/logger');
const sqldb = require('@prairielearn/prairielib/sql-db');
const question = require('../lib/question');
const externalGrader = require('./externalGrader');
const externalGradingSocket = require('../lib/externalGradingSocket');

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
        let brokenVariants = [];

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
                        // new_instance_question_ids is empty for Homework, non-empty for Exam
                        new_instance_question_ids = result.rows[0].new_instance_question_ids;
                        callback(null);
                    });
                },
                (callback) => {
                    async.each(new_instance_question_ids, (instance_question_id, callback) => {
                        const question_id = null; // use instance_question_id to determine the question
                        const options = {};
                        const require_open = true;
                        question._ensureVariantWithClient(client, question_id, instance_question_id, user_id, authn_user_id, course, options, require_open, (err, variant) => {
                            if (ERR(err, callback)) return;
                            if (variant.broken) {
                                brokenVariants.push(variant);
                            }
                            callback(null);
                        });
                    }, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
                (callback) => {
                    if (brokenVariants.length == 0) return callback(null);
                    // At least one variant is broken; unlink the
                    // broken variants so they will persist in the DB
                    // even after we delete the assessment_instance
                    async.eachSeries(brokenVariants, (variant, callback) => {
                        sqldb.callWithClient(client, 'variants_unlink', [variant.id], (err, _result) => {
                            if (ERR(err, callback)) return;
                            callback(null);
                        });
                    }, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
                (callback) => {
                    if (brokenVariants.length == 0) return callback(null);
                    // At least one variant is broken, so delete the assessment instance
                    var params = [
                        assessment_instance_id,
                        authn_user_id,
                    ];
                    sqldb.callWithClientOneRow(client, 'assessment_instances_delete', params, (err, _result) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
                (callback) => {
                    if (brokenVariants.length == 0) return callback(null);
                    // At least one variant is broken, so log an issue
                    const params = [
                        assessment_id,
                        'Unable to generate exam due to a broken question', // student_message
                        'Unable to generate exam due to a broken question', // instructor_message
                        true, // course_caused
                        {brokenVariants, mode, time_limit_min, course}, // course_data
                        null, // system_data
                        user_id,
                        authn_user_id,
                    ];
                    sqldb.call('issues_insert_for_assessment', params, (err, _result) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
            ], (err) => {
                sqldb.endTransaction(client, done, err, (err) => {
                    if (ERR(err, callback)) return;
                    if (brokenVariants.length > 0) {
                        // At least one variant is broken, so return an error
                        callback(error.makeWithData('unable to generate exam due to a broken question', {assessment_id, brokenVariants}));
                    } else {
                        callback(null, assessment_instance_id);
                    }
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
        // We may have to submit grading jobs to the external grader after this
        // grading transaction has been accepted; collect those job ids here.
        let grading_job_ids = [];
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
                    question._gradeVariantWithClient(client, row.variant, check_submission_id, row.question, row.course, authn_user_id, (err, grading_job_id) => {
                        if (ERR(err, callback)) return;
                        if (grading_job_id !== undefined) {
                            grading_job_ids.push(grading_job_id);
                        }
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
            callback(null, grading_job_ids);
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
        let grading_job_ids;
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
                    this._gradeAssessmentInstanceWithClient(client, assessment_instance_id, authn_user_id, close, (err, ret_grading_job_ids) => {
                        if (ERR(err, callback)) return;
                        grading_job_ids = ret_grading_job_ids;
                        debug('gradeAssessmentInstance()', 'finished _gradeAssessmentInstanceWithClient()');
                        callback(null);
                    });
                },
            ], (err) => {
                sqldb.endTransaction(client, done, err, (err) => {
                    if (ERR(err, callback)) return;
                    debug('gradeAssessmentInstance()', 'success');
                    if (grading_job_ids.length > 0) {
                        // We need to submit these grading jobs to be graded
                        externalGrader.beginGradingJobs(grading_job_ids, (err) => {
                            if (ERR(err, callback)) return;
                            callback(null);
                        });
                    } else {
                        // We're done!
                        callback(null);
                    }
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
                    content.grading.receivedTime,
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
            externalGradingSocket.gradingJobStatusUpdated(content.gradingId);
        });
    },
};
