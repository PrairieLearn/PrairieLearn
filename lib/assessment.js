const ERR = require('async-stacktrace');
const _ = require('lodash');
const async = require('async');
const ejs = require('ejs');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const error = require('@prairielearn/prairielib/error');
const logger = require('../lib/logger');
const question = require('../lib/question');
const externalGrader = require('./externalGrader');
const externalGradingSocket = require('../lib/externalGradingSocket');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const ltiOutcomes = require('../lib/ltiOutcomes');

const sql = sqlLoader.loadSqlEquiv(__filename);

/**
 * Assessment module.
 * @module assessment
 */

module.exports = {

    /**
     * Check that an assessment_instance_id really belongs to the given assessment_id
     *
     * @param {number} assessment_instance_id - The assessment instance to check.
     * @param {number} assessment_id - The assessment it should belong to.
     * @param {function} callback - A callback(err) function.
     */
    checkBelongs(assessment_instance_id, assessment_id, callback) {
        const params = {
            assessment_instance_id,
            assessment_id,
        };
        sqldb.query(sql.check_belongs, params, (err, result) => {
            if (ERR(err, callback)) return;
            if (result.rowCount != 1) return callback(new Error('access denied'));
            callback(null);
        });
    },

    /**
     * Construct a filename prefix that is unique for a given assessment.
     *
     * @param {Object} assessment - The assessment database object.
     * @param {Object} assessment_set - The assessment_set database object.
     * @param {Object} course_instance - The course_instance database object.
     * @param {Object} course - The course database object.
     */
    filenamePrefix(assessment, assessment_set, course_instance, course) {
        const sanitizeName = function(name) {
            return name.replace(/[^a-zA-Z0-9]/g, '_');
        };
        const prefix = sanitizeName(course.short_name)
              + '_'
              + sanitizeName(course_instance.short_name)
              + '_'
              + sanitizeName(assessment_set.abbreviation)
              + sanitizeName(assessment.number)
              + '_';
        return prefix;
    },

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

    /**
     * Create a new assessment instance and all the questions in it.
     *
     * @param {number} assessment_id - The assessment to create the assessment instance for.
     * @param {number} user_id - The user who will own the new assessment instance.
     * @param {number} authn_user_id - The current authenticated user.
     * @param {string} mode - The mode for the new assessment instance.
     * @param {?number} time_limit_min - The time limit for the new assessment instance.
     * @param {Date} date - The date of creation for the new assessment instance.
     * @param {function} callback - A callback(err, assessment_instance_id) function.
     */
    makeAssessmentInstance(assessment_id, user_id, authn_user_id, mode, time_limit_min, date, callback) {
        sqldb.beginTransaction((err, client, done) => {
            if (ERR(err, callback)) return;

            var assessment_instance_id;
            async.series([
                // Even though we only have a single series function,
                // we use the async.series pattern for consistency and
                // to make sure we correctly call endTransaction even
                // in the presence of errors.
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

    /**
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
                        ltiOutcomes.updateScore(assessment_instance_id, client, (err) => {
                            if (ERR(err, callback)) return;
                            callback(null);
                        });
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

    /**
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
            (callback) => {
                sqldb.queryOneRow(sql.select_assessment_for_grading_job, {grading_job_id: content.gradingId}, (err, result) => {
                    if (ERR(err, callback)) return;
                    let assessment_instance_id = result.rows[0].assessment_instance_id;
                    ltiOutcomes.updateScore(assessment_instance_id, null, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
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
