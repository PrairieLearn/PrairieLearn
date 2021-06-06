const ERR = require('async-stacktrace');
const _ = require('lodash');
const async = require('async');
const path = require('path');
const jsonStringifySafe = require('json-stringify-safe');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const ejs = require('ejs');
const QR = require('qrcode-svg');
const moment = require('moment');
const util = require('util');
const fs = require('fs');
const unzipper = require('unzipper');

const config = require('./config');
const csrf = require('./csrf');
const externalGrader = require('./externalGrader');
const logger = require('./logger');
const serverJobs = require('./server-jobs');
const { chalk, chalkDim } = require('./chalk');
const ltiOutcomes = require('../lib/ltiOutcomes');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const questionServers = require('../question-servers');
const workspaceHelper = require('./workspace');

const sql = sqlLoader.loadSqlEquiv(__filename);

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

/**
 * Internal error type for tracking parsing error when regrading.
 */
class RegradeParsingError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RegradeParsingError';
    }
}

/**
 * Internal error type thrown when attempting to regrade a question that uses
 * an external grader. To be removed in the future when regrading is implemented
 * for questions with external grading.
 */
class RegradeWithExternalGradingError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RegradeWithExternalGradingError';
    }
}

module.exports = {
    /**
     * Internal function, do not call directly. Write the courseIssues for a variant to the DB.
     * @protected
     *
     * @param {Object} client - SQL client that must be inside a transaction.
     * @param {Array} courseIssues - List of issue objects for to be written.
     * @param {Object} variant - The variant associated with the issues.
     * @param {number} authn_user_id - The currently authenticated user.
     * @param {string} studentMessage - The message to display to the student.
     * @param {Object} courseData - Arbitrary data to be associated with the issues.
     * @param {function} callback - A callback(err) function.
     */
    _writeCourseIssues(client, courseIssues, variant, authn_user_id, studentMessage, courseData, callback) {
        async.eachSeries(courseIssues, (courseErr, callback) => {
            const params = [
                variant.id,
                studentMessage,
                courseErr.toString(), // instructor message
                false, // manually_reported
                true, // course_caused
                courseData,
                {stack: courseErr.stack, courseErrData: courseErr.data}, // system_data
                authn_user_id,
            ];
            if (client) {
                sqldb.callWithClient(client, 'issues_insert_for_variant', params, (err) => {
                    if (ERR(err, callback)) return;
                    return callback(null);
                });
            } else {
                sqldb.call('issues_insert_for_variant', params, (err) => {
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
     * @param {function} callback - A callback(err, courseIssues, variant) function.
     */
    _makeVariant(question, course, options, callback) {
        debug('_makeVariant()');
        var variant_seed;
        if (_(options).has('variant_seed') && options.variant_seed != null) {
            variant_seed = options.variant_seed;
        } else {
            variant_seed = Math.floor(Math.random() * Math.pow(2, 32)).toString(36);
        }
        debug(`_makeVariant(): question_id = ${question.id}`);
        questionServers.getModule(question.type, (err, questionModule) => {
            if (ERR(err, callback)) return;
            questionModule.generate(question, course, variant_seed, (err, courseIssues, data) => {
                if (ERR(err, callback)) return;
                const hasFatalIssue = _.some(_.map(courseIssues, 'fatal'));
                var variant = {
                    variant_seed: variant_seed,
                    params: data.params || {},
                    true_answer: data.true_answer || {},
                    options: data.options || {},
                    broken: hasFatalIssue,
                };
                if (question.workspace_image !== null) { // if workspace, add graded files to params
                    variant.params['_workspace_required_file_names'] = question.workspace_graded_files || [];
                    if(!('_required_file_names' in variant.params)) {
                        variant.params['_required_file_names'] = [];
                    }
                    variant.params['_required_file_names'] = variant.params['_required_file_names'].concat(question.workspace_graded_files);
                }
                if (variant.broken) {
                    return callback(null, courseIssues, variant);
                }
                questionModule.prepare(question, course, variant, (err, extraCourseIssues, data) => {
                    if (ERR(err, callback)) return;
                    courseIssues.push(...extraCourseIssues);
                    const hasFatalIssue = _.some(_.map(courseIssues, 'fatal'));
                    var variant = {
                        variant_seed: variant_seed,
                        params: data.params || {},
                        true_answer: data.true_answer || {},
                        options: data.options || {},
                        broken: hasFatalIssue,
                    };
                    callback(null, courseIssues, variant);
                });
            });
        });
    },

    /**
    * Get a file that is generated by code.
    *
    * @param {String} filename
    * @param {Object} variant - The variant.
    * @param {Object} question - The question for the variant.
    * @param {Object} course - The course for the variant.
    * @param {Number} authn_user_id - The current authenticated user.
    * @param {function} callback - A callback(err, fileData) function.
    */
    getFile(filename, variant, question, course, authn_user_id, callback) {
        questionServers.getModule(question.type, (err, questionModule) => {
            if (ERR(err, callback)) return;
            questionModule.file(filename, variant, question, course, (err, courseIssues, fileData) => {
                if (ERR(err, callback)) return;

                const studentMessage = 'Error creating file: ' + filename;
                const courseData = {variant, question, course};
                this._writeCourseIssues(null, courseIssues, variant, authn_user_id, studentMessage, courseData, (err) => {
                    if (ERR(err, callback)) return;

                    return callback(null, fileData);
                });
            });
        });
    },



    /**
     * Internal function, do not call directly. Get a question by either question_id or instance_question_id.
     * @protected
     *
     * @param {?number} question_id - The question for the new variant. Can be null if instance_question_id is provided.
     * @param {?number} instance_question_id - The instance question for the new variant. Can be null if question_id is provided.
     * @param {function} callback - A callback(err, question) function.
     */
    _selectQuestionWithClient(client, question_id, instance_question_id, callback) {
        if (question_id != null) {
            sqldb.callWithClientOneRow(client, 'questions_select', [question_id], (err, result) => {
                if (ERR(err, callback)) return;
                const question = result.rows[0];
                callback(null, question);
            });
        } else {
            if (instance_question_id == null) return callback(new Error('question_id and instance_question_id cannot both be null'));
            sqldb.callWithClientOneRow(client, 'instance_questions_select_question', [instance_question_id], (err, result) => {
                if (ERR(err, callback)) return;
                const question = result.rows[0];
                callback(null, question);
            });
        }
    },

    /**
     * Internal function, do not call directly. Create a variant object, and write it to the DB.
     * @protected
     *
     * @param {Object} client - SQL client that must be inside a transaction.
     * @param {?number} question_id - The question for the new variant. Can be null if instance_question_id is provided.
     * @param {?number} instance_question_id - The instance question for the new variant, or null for a floating variant.
     * @param {number} user_id - The user for the new variant.
     * @param {number} authn_user_id - The current authenticated user.
     * @param {boolean} group_work - If the assessment will support group work.
     * @param {Object} course - The course for the variant.
     * @param {Object} options - Options controlling the creation: options = {variant_seed}
     * @param {function} callback - A callback(err, variant) function.
     */
    _makeAndInsertVariantWithClient(client, question_id, instance_question_id, user_id, authn_user_id, group_work, course_instance_id, course, options, callback) {
        this._selectQuestionWithClient(client, question_id, instance_question_id, (err, question) => {
            if (ERR(err, callback)) return;
            this._makeVariant(question, course, options, (err, courseIssues, variant) => {
                if (ERR(err, callback)) return;
                const params = [
                    variant.variant_seed,
                    variant.params,
                    variant.true_answer,
                    variant.options,
                    variant.broken,
                    instance_question_id,
                    question.id,
                    course_instance_id,
                    user_id,
                    authn_user_id,
                    group_work,
                ];
                sqldb.callWithClientOneRow(client, 'variants_insert', params, (err, result) => {
                    if (ERR(err, callback)) return;
                    const variant = result.rows[0].variant;
                    debug('variants_insert', variant);

                    const studentMessage = 'Error creating question variant';
                    const courseData = {variant, question, course};
                    this._writeCourseIssues(client, courseIssues, variant, authn_user_id, studentMessage, courseData, (err) => {
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
     * @param {Object} client - SQL client that must be inside a transaction.
     * @param {?number} question_id - The question for the new variant. Can be null if instance_question_id is provided.
     * @param {?number} instance_question_id - The instance question for the new variant, or null for a floating variant.
     * @param {number} user_id - The user for the new variant.
     * @param {number} authn_user_id - The current authenticated user.
     * @param {boolean} group_work - If the assessment will support group work.
     * @param {Object} course - The course for the variant.
     * @param {Object} options - Options controlling the creation: options = {variant_seed}
     * @param {boolean} require_open - If true, only use an existing variant if it is open.
     * @param {function} callback - A callback(err, variant) function.
     */
    _ensureVariantWithClient(client, question_id, instance_question_id, user_id, authn_user_id, group_work, course_instance_id, course, options, require_open, callback) {
        if (instance_question_id != null) {
            // see if we have a useable existing variant, otherwise
            // make a new one
            var params = [
                instance_question_id,
                require_open,
            ];
            sqldb.callWithClient(client, 'instance_questions_select_variant', params, (err, result) => {
                if (ERR(err, callback)) return;
                const variant = result.rows[0].variant;
                if (variant != null) {
                    debug('instance_questions_select_variant not null', variant);
                    return callback(null, variant);
                }
                this._makeAndInsertVariantWithClient(client, question_id, instance_question_id, user_id, authn_user_id, group_work, course_instance_id, course, options, (err, variant) => {
                    if (ERR(err, callback)) return;
                    debug('instance_questions_select_variant was null, run through _makeAndInsertVariantWithClient', variant);
                    callback(null, variant);
                });
            });
        } else {
            // if we don't have instance_question_id, just make a new variant
            this._makeAndInsertVariantWithClient(client, question_id, instance_question_id, user_id, authn_user_id, group_work, course_instance_id, course, options, (err, variant) => {
                if (ERR(err, callback)) return;
                callback(null, variant);
            });
        }
    },

    /**
     * Ensure that there is a variant for the given instance question.
     *
     * @param {?number} question_id - The question for the new variant. Can be null if instance_question_id is provided.
     * @param {?number} instance_question_id - The instance question for the new variant, or null for a floating variant.
     * @param {number} user_id - The user for the new variant.
     * @param {number} authn_user_id - The current authenticated user.
     * @param {boolean} group_work - If the assessment will support group work.
     * @param {?number} course_instance_id - The course instance for this variant. Can be null for instructor questions.
     * @param {Object} course - The course for the variant.
     * @param {Object} options - Options controlling the creation: options = {variant_seed}
     * @param {boolean} require_open - If true, only use an existing variant if it is open.
     * @param {function} callback - A callback(err, variant) function.
     */
    ensureVariant(question_id, instance_question_id, user_id, authn_user_id, group_work, course_instance_id, course, options, require_open, callback) {
        let variant;
        sqldb.beginTransaction((err, client, done) => {
            if (ERR(err, callback)) return;
            async.series([
                // Even though we only have a single series function,
                // we use the async.series pattern for consistency and
                // to make sure we correctly call endTransaction even
                // in the presence of errors.
                (callback) => {
                    this._ensureVariantWithClient(client, question_id, instance_question_id, user_id, authn_user_id, group_work, course_instance_id, course, options, require_open, (err, ret_variant) => {
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

    /**
     * Internal worker for saveSubmission(). Do not call directly.
     * @protected
     *
     * @param {Object} client - SQL client that must be inside a transaction.
     * @param {Object} submission - The submission to save (should not have an id property yet).
     * @param {Object} variant - The variant to submit to.
     * @param {Object} question - The question for the variant.
     * @param {Object} course - The course for the variant.
     * @param {function} callback - A callback(err, submission_id) function.
     */
    _saveSubmissionWithClient(client, submission, variant, question, course, callback) {
        debug('_saveSubmissionWithClient()');
        submission.raw_submitted_answer = submission.submitted_answer;
        submission.gradable = true;
        let questionModule, courseIssues, data, submission_id, workspace_id, zipPath;
        async.series([
            (callback) => { // if workspace, get workspace_id
                if (question.workspace_image != null) {
                    const params = {
                        variant_id: submission.variant_id,
                    };
                    sqldb.queryZeroOrOneRow(sql.select_workspace_id, params, (err, result) => {
                        if (ERR(err, callback)) return;
                        if (result.rowCount > 0) {
                            workspace_id = result.rows[0].workspace_id;
                        }
                        callback(null);
                    });
                } else {
                    callback(null);
                }
            },
            (callback) => { // if we have a workspace and any files to be graded, get the files
                if (workspace_id == null || !question.workspace_graded_files || !question.workspace_graded_files.length) {
                    debug('_saveSubmissionWithClient()', 'not getting workspace graded files');
                    return callback(null);
                }
                util.callbackify(workspaceHelper.getGradedFiles)(workspace_id, (err, result) => {
                    if (ERR(err, callback)) return;
                    zipPath = result;
                    debug('_saveSubmissionWithClient()', `saved graded files: ${zipPath}`);
                    callback(null);
                });
            },
            async () => { // if we have workspace files, encode them into _files
                if (zipPath == null) return;

                const zip = fs.createReadStream(zipPath).pipe(unzipper.Parse({ forceStream: true }));
                if (!('_files' in submission.submitted_answer)) {
                    submission.submitted_answer['_files'] = [];
                }

                for await (const zipEntry of zip) {
                    const name = zipEntry.path;
                    const contents = (await zipEntry.buffer()).toString('base64');
                    submission.submitted_answer['_files'].push({ name, contents });
                }
                await fs.promises.unlink(zipPath);
            },
            (callback) => {
                questionServers.getModule(question.type, (err, ret_questionModule) => {
                    if (ERR(err, callback)) return;
                    questionModule = ret_questionModule;
                    debug('_saveSubmissionWithClient()', 'loaded questionModule');
                    callback(null);
                });
            },
            (callback) => {
                questionModule.parse(submission, variant, question, course, (err, ret_courseIssues, ret_data) => {
                    if (ERR(err, callback)) return;
                    courseIssues = ret_courseIssues;
                    data = ret_data;

                    debug('_saveSubmissionWithClient()', 'completed parse()');
                    callback(null);
                });
            },
            (callback) => {
                const studentMessage = 'Error parsing submission';
                const courseData = {variant, question, submission, course};
                this._writeCourseIssues(client, courseIssues, variant, submission.auth_user_id, studentMessage, courseData, (err) => {
                    if (ERR(err, callback)) return;
                    debug('_saveSubmissionWithClient()', `wrote courseIssues: ${courseIssues.length}`);
                    callback(null);
                });
            },
            (callback) => {
                const hasFatalIssue = _.some(_.map(courseIssues, 'fatal'));
                if (hasFatalIssue) data.gradable = false;
                data.broken = hasFatalIssue;
                debug('_saveSubmissionWithClient()', 'hasFatalIssue', hasFatalIssue);

                const params = [
                    data.submitted_answer,
                    data.raw_submitted_answer,
                    data.format_errors,
                    data.gradable,
                    data.broken,
                    submission.credit,
                    submission.mode,
                    submission.variant_id,
                    submission.auth_user_id,
                ];
                sqldb.callWithClientOneRow(client, 'submissions_insert', params, (err, result) => {
                    if (ERR(err, callback)) return;
                    submission_id = result.rows[0].submission_id;
                    debug('_saveSubmissionWithClient()', 'inserted', 'submission_id:', submission_id);
                    callback(null);
                });
            },
        ], (err) => {
            if (ERR(err, callback)) return;
            debug('_saveSubmissionWithClient()', 'returning', 'submission_id:', submission_id);
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
                // Even though we only have a single series function,
                // we use the async.series pattern for consistency and
                // to make sure we correctly call endTransaction even
                // in the presence of errors.
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
     * @param {Object} client - SQL client that must be inside a transaction.
     * @param {Object} variant - The variant to grade.
     * @param {?number} check_submission_id - The submission_id that must be graded (or null to skip this check).
     * @param {Object} question - The question for the variant.
     * @param {Object} course - The course for the variant.
     * @param {number} authn_user_id - The currently authenticated user.
     * @param {boolean} overrideGradeRateCheck - Whether to override grade rate limits.
     * @param {function} callback - A callback(err, grading_job_id) function. Will be
     *                            called with a grading_job id as the second parameter
     *                            if this grading request must be fulfilled by an
     *                            external autograder. This request should only be
     *                            submitted once the transaction of this client is
     *                            committed.
     */
    _gradeVariantWithClient(client, variant, check_submission_id, question, course, authn_user_id, overrideGradeRateCheck, callback) {
        debug('_gradeVariantWithClient()');
        let questionModule, courseIssues, data, submission, grading_job;
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
                    debug('_gradeVariantWithClient()', 'selected submission', 'submission.id:', submission.id);
                    callback(null);
                });
            },
            (callback) => {
                if (overrideGradeRateCheck) return callback(null);
                var params = [
                    variant.instance_question_id,
                ];
                sqldb.callWithClientZeroOrOneRow(client, 'instance_questions_next_allowed_grade', params, (err, result) => {
                    if (ERR(err, callback)) return;
                    debug('_gradeVariantWithClient()', 'checked grade rate', 'allow_grade_left_ms:', result.rows[0].allow_grade_left_ms);
                    if (result.rows[0].allow_grade_left_ms > 0) return callback(new NoSubmissionError());
                    callback(null);
                });
            },
            (callback) => {
                questionServers.getModule(question.type, (err, ret_questionModule) => {
                    if (ERR(err, callback)) return;
                    questionModule = ret_questionModule;
                    debug('_gradeVariantWithClient()', 'loaded questionModule');
                    callback(null);
                });
            },
            (callback) => {
                if (question.grading_method == 'Internal') {
                    // for Internal grading we call the grading code
                    questionModule.grade(submission, variant, question, course, (err, ret_courseIssues, ret_data) => {
                        if (ERR(err, callback)) return;
                        courseIssues = ret_courseIssues;
                        data = ret_data;
                        const hasFatalIssue = _.some(_.map(courseIssues, 'fatal'));
                        if (hasFatalIssue) data.gradable = false;
                        data.broken = hasFatalIssue;
                        debug('_gradeVariantWithClient()', 'completed grade()', 'hasFatalIssue:', hasFatalIssue);
                        callback(null);
                    });
                } else {
                    // for External or Manual grading we don't do anything
                    courseIssues = [];
                    data = {};
                    callback(null);
                }
            },
            (callback) => {
                const studentMessage = 'Error grading submission';
                const courseData = {variant, question, submission, course};
                this._writeCourseIssues(client, courseIssues, variant, submission.auth_user_id, studentMessage, courseData, (err) => {
                    if (ERR(err, callback)) return;
                    debug('_gradeVariantWithClient()', `wrote courseIssues: ${courseIssues.length}`);
                    callback(null);
                });
            },
            (callback) => {
                const params = [
                    submission.id,
                    authn_user_id,
                    data.gradable,
                    data.broken,
                    data.format_errors,
                    data.partial_scores,
                    data.score,
                    data.v2_score,
                    data.feedback,
                    data.submitted_answer,
                    data.params,
                    data.true_answer,
                    false,
                ];
                sqldb.callWithClientOneRow(client, 'grading_jobs_insert', params, (err, result) => {
                    if (ERR(err, callback)) return;

                    /* If the submission was marked invalid during grading the grading job will
                       be marked ungradable and we should bail here to prevent LTI updates. */
                    grading_job = result.rows[0];
                    if (!grading_job.gradable) return callback(new NoSubmissionError());

                    debug('_gradeVariantWithClient()', 'inserted', 'grading_job.id:', grading_job.id);
                    callback(null);
                });
            },
            (callback) => {
                sqldb.queryWithClientOneRow(client, sql.select_assessment_for_submission, {submission_id: submission.id}, (err, result) => {
                    if (ERR(err, callback)) return;
                    let assessment_instance_id = result.rows[0].assessment_instance_id;
                    ltiOutcomes.updateScore(assessment_instance_id, client, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                });
            },
        ], (err) => {
            // catch NoSubmissionError as we are just using it to exit with no action
            if (err instanceof NoSubmissionError) {
                debug('_gradeVariantWithClient()', 'no submissions for grading, skipping');
                err = null;
            }
            if (ERR(err, callback)) return;
            debug('_gradeVariantWithClient()', 'success');
            // data and grading_job might not be defined if we bailed out early above
            if (data && !data.broken && grading_job && grading_job.grading_method == 'External') {
                // We'll need to queue this job for grading once this
                // transaction completes
                callback(null, grading_job.id);
            } else {
                callback(null);
            }
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
     * @param {boolean} overrideGradeRateCheck - Whether to override grade rate limits.
     * @param {function} callback - A callback(err) function.
     */
    gradeVariant(variant, check_submission_id, question, course, authn_user_id, overrideGradeRateCheck, callback) {
        let grading_job_id;
        sqldb.beginTransaction((err, client, done) => {
            if (ERR(err, callback)) return;
            async.series([
                // Even though we only have a single series function,
                // we use the async.series pattern for consistency and
                // to make sure we correctly call endTransaction even
                // in the presence of errors.
                (callback) => {
                    this._gradeVariantWithClient(client, variant, check_submission_id, question, course, authn_user_id, overrideGradeRateCheck, (err, ret_grading_job_id) => {
                        if (ERR(err, callback)) return;
                        grading_job_id = ret_grading_job_id;
                        callback(null);
                    });
                },
            ], (err) => {
                sqldb.endTransaction(client, done, err, (err) => {
                    if (ERR(err, callback)) return;
                    if (grading_job_id !== undefined) {
                        // We need to submit this grading job now that the
                        // transaction has been committed
                        externalGrader.beginGradingJob(grading_job_id, (err) => {
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
     * Internal worker for regradeQuestion(). Do not call directly.
     * @protected
     *
     * @param {Object} client - SQL client that must be inside a transaction.
     * @param {Object} variant - The variant to regrade.
     * @param {Object} submission - The submission to regrade.
     * @param {Object} question - The question for the variant.
     * @param {Object} course - The course for the variant.
     * @param {number} authn_user_id - The currently authenticated user.
     * @param {Job} serverJob - The server job object that we can use to print to the 
     *                          server job interface.
     * @param {function} callback - A callback(err) function.
     */
    _regradeVariantWithClient(client, variant, submission, question, course, authn_user_id, serverJob, callback) {
        debug('_regradeVariantWithClient()');

        if (!variant.open) {
            serverJob.verbose(chalk.yellow('⚠ Variant is no longer open, skipping.'));
            debug('_regradeVariantWithClient()', 'variant closed');
            return callback(null);
        }

        let questionModule, courseIssues, data, grading_job;

        async.series([
            (callback) => {
                sqldb.queryWithClientOneRow(client, sql.select_instance_question_by_variant_id, {variant_id: variant.id}, (err, result) => {
                    if (ERR(err, callback)) return;
                    if (!result.rows[0].open) {
                        return callback('instance question closed');
                    }
                    callback(null);
                });
            },
            (callback) => {
                questionServers.getModule(question.type, (err, ret_questionModule) => {
                    if (ERR(err, callback)) return;
                    questionModule = ret_questionModule;
                    debug('_regradeVariantWithClient()', 'loaded questionModule');
                    callback(null);
                });
            },
            (callback) => {
                questionModule.parse(submission, variant, question, course, (err, ret_courseIssues, ret_data) => {
                    if (ERR(err, callback)) return;
                    courseIssues = ret_courseIssues;
                    data = ret_data;

                    debug('_regradeVariantWithClient()', 'completed parse()');
                    callback(null);
                });
            },
            (callback) => {
                if (!data.gradable) {
                    debug('_regradeVariantWithClient()', 'error when parsing');
                    return callback(new RegradeParsingError());
                }
                // Instead of updating the submission in database, we directly modify the submission obj
                submission.submitted_answer = data.submitted_answer;
                debug('_regradeVariantWithClient()', 'submitted_answer:', submission.submitted_answer);
                submission.raw_submitted_answer = data.raw_submitted_answer;
                callback(null);
            },
            (callback) => {
                if (question.grading_method == 'Internal') {
                    // for Internal grading we call the grading code
                    questionModule.grade(submission, variant, question, course, (err, ret_courseIssues, ret_data) => {
                        if (ERR(err, callback)) return;
                        courseIssues = ret_courseIssues;
                        data = ret_data;
                        const hasFatalIssue = _.some(_.map(courseIssues, 'fatal'));
                        if (hasFatalIssue) data.gradable = false;
                        data.broken = hasFatalIssue;
                        debug('_regradeVariantWithClient()', 'completed grade()', 'hasFatalIssue:', hasFatalIssue);
                        callback(null);
                    });
                } else {
                    // for External or Manual grading we don't do anything
                    courseIssues = [];
                    data = {};
                    callback(null);
                }
            },
            (callback) => {
                if (courseIssues.length != 0) {
                    serverJob.verbose('Encountered fatal grading issue when regrading:');

                    async.eachSeries(courseIssues, ((courseErr, callback) => {
                        serverJob.error(chalk.red(courseErr));
                        serverJob.verbose('-------------------------------------------Console Log-------------------------------------------');
                        serverJob.verbose(courseErr.data.outputStderr);
                        serverJob.verbose('-------------------------------------------Stack-------------------------------------------');
                        serverJob.verbose(courseErr.data.stack);
                        serverJob.verbose('-------------------------------------------------------------------------------------------------');
                        callback(null);
                    }));
                    callback('Encountered fatal error when running grading script');
                } else {
                    callback(null);
                }
            },
            (callback) => {
                const params = [
                    submission.id,
                    authn_user_id,
                    data.gradable,
                    data.broken,
                    data.format_errors,
                    data.partial_scores,
                    data.score,
                    data.v2_score,
                    data.feedback,
                    data.submitted_answer,
                    data.params,
                    data.true_answer,
                    true,   // is_regrade
                ];
                sqldb.callWithClientOneRow(client, 'grading_jobs_insert', params, (err, result) => {
                    if (ERR(err, callback)) return;

                    /* If the submission was marked invalid during grading, the grading job will
                       be marked ungradable and we should bail here to prevent LTI updates. */
                    grading_job = result.rows[0];
                    if (!grading_job.gradable) return callback(new NoSubmissionError());

                    debug('_regradeVariantWithClient()', 'inserted', 'grading_job.id:', grading_job.id);
                    callback(null);
                });
            },
            (callback) => {
                sqldb.queryWithClientOneRow(client, sql.select_instance_question_by_variant_id, {variant_id: variant.id}, (err, result) => {
                    if (ERR(err, callback)) return;
                    data.points = result.rows[0].points;
                    callback(null);
                });
            },
            (callback) => {
                sqldb.queryWithClientOneRow(client, sql.select_assessment_for_submission, {submission_id: submission.id}, (err, result) => {
                    if (ERR(err, callback)) return;
                    let assessment_instance_id = result.rows[0].assessment_instance_id;
                    ltiOutcomes.updateScore(assessment_instance_id, client, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                });
            },
        ], (err) => {
            // catch errors that are used to exit this function with no action
            if (err instanceof NoSubmissionError) {
                debug('_regradeVariantWithClient()', '⚠ Submission could not be graded, skipping.');
                return callback(null);
            } else if (err == 'instance question closed') {
                debug('_regradeVariantWithClient()', 'instance question closed');
                serverJob.verbose(chalk.yellow(`⚠ Instance question is no longer open, skipping.`));
                return callback(null);
            } else if (err instanceof RegradeParsingError) {
                serverJob.error(chalk.yellow('⚠ Error when trying to parse this submission, skipping.'));
                debug('_regradeVariantWithClient()', 'error when parsing');
                return callback(null);
            }
            
            if (ERR(err, callback)) return;
            serverJob.verbose(chalk.green(`✓ Regrade submission successful. Regraded submission score: ${data.score}. Points awarded: ${data.points}.`));
            debug('_regradeVariantWithClient()', 'success');
            callback(null);
        });
    },

    /**
     * Regrade all the submission for all the variants for a sepecific instance question.
     *
     * @param {number} authn_user_id - The currently authenticated user.
     * @param {number} course_id - The course that this instance question belongs to.
     * @param {number} instance_question_id - The instance question id.
     * @param {boolean} keep_highest_score - Whether to keep the original score if it's higher.
     * @param {function} callback - A callback(err, job_sequence_id) function.
     */
    regradeQuestion(authn_user_id, course_id, instance_question_id, keep_highest_score, callback) {
        const options = {
            course_id: course_id,
            user_id: authn_user_id,
            authn_user_id: authn_user_id,
            type: 'regrade_instance_question_for_one_student',
            description: 'Regrade question',
        };
        serverJobs.createJobSequence(options, (err, job_sequence_id) => {
            if (ERR(err, callback)) return;
            callback(null, job_sequence_id);
            // We've now triggered the callback to our caller, but we
            // continue executing below to launch the jobs themselves.

            const jobOptions = {
                course_id: course_id,
                user_id: authn_user_id,
                authn_user_id: authn_user_id,
                type: 'regrade_instance_question_for_one_student',
                description: 'Regrade question',
                job_sequence_id: job_sequence_id,
                last_in_sequence: true,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (err) {
                    logger.error('Error in createJob()', err);
                    serverJobs.failJobSequence(job_sequence_id);
                    return;
                }
                
                let submissions;
                let original_instance_question, regraded_instance_question;
                let original_variants_info;
                let course_id, course;
                let question_id, question;
                let assessment_instance_id;
                let init_points;
                let qid;

                // We want to first check if there is any submission for this question instance.
                // If there is no submission, we can just return.
                sqldb.query(sql.select_graded_submissions_and_other_data, {instance_question_id: instance_question_id}, (err, result) => {
                    if (err) {
                        job.fail('Error in select_graded_submissions_and_other_data');
                        logger.error('Error in select_graded_submissions_and_other_data', err);
                        return;
                    }
                    if (result.rowCount === 0) {
                        job.verbose(`No submission found.`);
                        job.succeed();
                        return;
                    }

                    submissions = result.rows;
                    course_id = submissions[0].course_id;
                    question_id = submissions[0].question_id;
                    init_points = submissions[0].init_points;
                    assessment_instance_id = submissions[0].assessment_instance_id;
                    qid = submissions[0].qid;
                    job.verbose(`${result.rowCount} submissions found for question '${qid}'.`);
                    job.verbose(`Keep highest score: ${keep_highest_score}`);
                    debug('regradeQuestion()', 'get all submissions', 'instance_question_id:', instance_question_id);

                    sqldb.beginTransaction((err, client, done) => {
                        if (err) {
                            job.verbose('Error in beginTransaction()');
                            logger.error('Error in beginTransaction()', err);
                            return;
                        }
                        async.series([
                            (callback) => {
                                // Get course obj
                                sqldb.queryWithClientOneRow(client, sql.select_course, {course_id: course_id}, (err, result) => {
                                    if (ERR(err, callback)) return;
                                    course = result.rows[0];
                                    callback(null);
                                });
                            },
                            (callback) => {
                                // Get question obj
                                sqldb.queryWithClientOneRow(client, sql.select_question, {question_id: question_id}, (err, result) => {
                                    if (ERR(err, callback)) return;
                                    question = result.rows[0];

                                    if (question.grading_method == 'External') {
                                        return callback(new RegradeWithExternalGradingError());
                                    }

                                    callback(null);
                                });
                            },
                            // record the original question instance data
                            (callback) => {
                                const params = {
                                    instance_question_id: instance_question_id,
                                };
                                sqldb.queryWithClientOneRow(client, sql.select_instance_question, params, (err, result) => {
                                    if (ERR(err, callback)) return;
                                    original_instance_question = result.rows[0];
                                    job.verbose(`Current number of points earned for this instance question: ${original_instance_question.points}`);
                                    callback(null);
                                });
                            },
                            // record info of variants associated with the instance question
                            (callback) => {
                                const params = {
                                    instance_question_id: instance_question_id,
                                };
                                sqldb.queryWithClient(client, sql.select_variants_info_for_instance_question, params, (err, result) => {
                                    if (ERR(err, callback)) return;
                                    original_variants_info = result.rows;
                                    callback(null);
                                });
                            },
                            // Reset the instance question to an "unanswered" state. In other words, the instance
                            // question will appear to have never been answered.
                            (callback) => {
                                const params = {
                                    init_points: init_points,
                                    instance_question_id: instance_question_id,
                                };
                                sqldb.queryWithClient(client, sql.reset_instance_question, params, (err) => {
                                    if (err) {
                                        callback(err);
                                    } else {
                                        job.verbose(`Question '${qid}' successfully reset.`);
                                        callback(null);
                                    }
                                });
                            },
                            // re-open all variants for the instance question, and set num_tries to 0 for each variant
                            (callback) => {
                                const params = {
                                    instance_question_id: instance_question_id,
                                };
                                sqldb.queryWithClient(client, sql.reset_variants, params, (err) => {
                                    if (err) {
                                        callback(err);
                                    } else {
                                        job.verbose(`Reset all variants for question '${qid}'.`);
                                        callback(null);
                                    }
                                });
                            },
                            // perform the regrading
                            (callback) => {
                                let idx = 1;
                                job.verbose('Start regrading submissions');
                                async.eachSeries(submissions, ((submission, callback) => {
                                    job.verbose(chalkDim(`Regrading graded submission ${idx}...`));
                                    idx += 1;

                                    // ********* Manually mark submission to be not broken and gradable *********
                                    submission.broken = false;  
                                    submission.gradable = true;
                                    // **************************************************************************

                                    // ******** Manually reset submitted_answer and clear format_errors *********
                                    submission.submitted_answer = submission.raw_submitted_answer;
                                    submission.format_errors = {};
                                    // **************************************************************************
                                    let variant;
                                    sqldb.queryWithClientOneRow(client, sql.select_variant, {variant_id: submission.variant_id}, (err, result) => {
                                        if (ERR(err, callback)) return;
                                        variant = result.rows[0];
                                        this._regradeVariantWithClient(client, variant, submission, question, course, submission.auth_user_id, job, callback);
                                    });
                                }), (err) => {
                                    if (ERR(err, callback)) return;
                                    callback(null);
                                });
                            },
                            // record the new question instance data
                            (callback) => {
                                const params = {
                                    instance_question_id: instance_question_id,
                                };
                                sqldb.queryWithClientOneRow(client, sql.select_instance_question, params, (err, result) => {
                                    if (ERR(err, callback)) return;
                                    regraded_instance_question = result.rows[0];
                                    job.verbose(`Points earned from regrading: ${regraded_instance_question.points}`);
                                    callback(null);
                                });
                            },
                            // if user choose to keep highest score and the regraded score is lower, restore instance question back to pre-regrade stage
                            (callback) => {
                                if (!keep_highest_score || original_instance_question.points <= regraded_instance_question.points) {
                                    callback(null);
                                    return;
                                }
                                job.verbose(chalk.yellow('The new score is lower than the original score. Restoring the original instance question.'));
                                sqldb.queryWithClient(client, sql.restore_instance_question, original_instance_question, (err) => {
                                    if (ERR(err, callback)) return;
                                    callback(null);
                                });
                            },
                            // if user choose to keep highest score and the regraded score is lower, restore question variants back to pre-regrade stage
                            (callback) => {
                                if (!keep_highest_score || original_instance_question.points <= regraded_instance_question.points) {
                                    callback(null);
                                    return;
                                }
                                const params = {
                                    original_variants_info: original_variants_info,
                                };
                                job.verbose(chalk.yellow('Restoring variants.'));
                                async.eachSeries(original_variants_info, (variant_info, callback) => {
                                    const params = {
                                        variant_open: variant_info.open,
                                        variant_num_tries: variant_info.num_tries,
                                        variant_id: variant_info.id,
                                    };

                                    sqldb.queryWithClient(client, sql.restore_variant, params, (err) => {
                                        if (ERR(err, callback)) return;
                                        callback(null);
                                    });
                                }, (err) => {
                                    if (ERR(err, callback)) return;
                                    callback(null);
                                });
                            },
                            // manually update the assessment instance score if:
                            // 1. The user choose not to keep the highest score
                            // 2. The user choose to keep the highest score, but the regraded score is lower
                            (callback) => {
                                if (!keep_highest_score || original_instance_question.points > regraded_instance_question.points) {
                                    const params = [
                                        assessment_instance_id,
                                        authn_user_id,
                                        null, // credit
                                        true, // the score is the same and we don't to log it
                                        true, // allow decrease
                                    ];
                                    sqldb.callWithClientOneRow(client, 'assessment_instances_grade', params, (err, _result) => {
                                        if (ERR(err, callback)) return;
                                        debug('graded');
                                        ltiOutcomes.updateScore(assessment_instance_id, client, (err) => {
                                            if (ERR(err, callback)) return;
                                            callback(null);
                                        });
                                    });
                                } else {
                                    callback(null);
                                }
                            },
                        ], (err) => {
                            sqldb.endTransaction(client, done, err, (err) => {
                                if (err) {
                                    if (err instanceof RegradeWithExternalGradingError) {
                                        job.fail('Cannot regrade a question with an external grader.');
                                    } else {
                                        logger.error('Regrading error', err);
                                        job.verbose('Encountered error when regrading:');
                                        job.error(chalk.red(err));
                                        job.fail();
                                    }
                                } else {
                                    job.verbose(`Successfully regraded question ${qid}.`);
                                    job.succeed();
                                }
                            });
                        });
                    });
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
     * @param {boolean} overrideGradeRateCheck - Whether to override grade rate limits.
     * @param {function} callback - A callback(err, submission_id) function.
     */
    saveAndGradeSubmission(submission, variant, question, course, overrideGradeRateCheck, callback) {
        debug('saveAndGradeSubmission()');
        let submission_id, grading_job_id;
        sqldb.beginTransaction((err, client, done) => {
            if (ERR(err, callback)) return;
            async.series([
                (callback) => {
                    this._saveSubmissionWithClient(client, submission, variant, question, course, (err, ret_submission_id) => {
                        if (ERR(err, callback)) return;
                        submission_id = ret_submission_id;
                        debug('saveAndGradeSubmission()', 'submission_id:', submission_id);
                        callback(null);
                    });
                },
                (callback) => {
                    this._gradeVariantWithClient(client, variant, submission_id, question, course, submission.auth_user_id, overrideGradeRateCheck, (err, ret_grading_job_id) => {
                        if (ERR(err, callback)) return;
                        grading_job_id = ret_grading_job_id;
                        debug('saveAndGradeSubmission()', 'graded');
                        callback(null);
                    });
                },
            ], (err) => {
                sqldb.endTransaction(client, done, err, (err) => {
                    if (ERR(err, callback)) return;
                    debug('saveAndGradeSubmission()', 'returning submission_id:', submission_id);
                    if (grading_job_id !== undefined) {
                        // We need to submit this grading job now that the
                        // transaction has been committed
                        externalGrader.beginGradingJob(grading_job_id, (err) => {
                            if (ERR(err, callback)) return;
                            callback(null, submission_id);
                        });
                    } else {
                        // We're done!
                        callback(null, submission_id);
                    }
                });
            });
        });
    },

    /**
     * Internal worker for testVariant(). Do not call directly.
     * @protected
     *
     * @param {Object} client - SQL client that must be inside a transaction.
     * @param {Object} variant - The variant to submit to.
     * @param {Object} question - The question for the variant.
     * @param {Object} course - The course for the variant.
     * @param {string} test_type - The type of test to run.  Should be one of 'correct', 'incorrect', or 'invalid'.
     * @param {number} authn_user_id - The currently authenticated user.
     * @param {function} callback - A callback(err, submission_id) function.
     */
    _createTestSubmissionWithClient(client, variant, question, course, test_type, authn_user_id, callback) {
        debug('_createTestSubmissionWithClient()');
        if (question.type != 'Freeform') return callback(new Error('question.type must be Freeform'));
        let questionModule, courseIssues, data, submission_id, grading_job;
        async.series([
            (callback) => {
                questionServers.getModule(question.type, (err, ret_questionModule) => {
                    if (ERR(err, callback)) return;
                    questionModule = ret_questionModule;
                    debug('_createTestSubmissionWithClient()', 'loaded questionModule');
                    callback(null);
                });
            },
            (callback) => {
                questionModule.test(variant, question, course, test_type, (err, ret_courseIssues, ret_data) => {
                    if (ERR(err, callback)) return;
                    courseIssues = ret_courseIssues;
                    data = ret_data;
                    const hasFatalIssue = _.some(_.map(courseIssues, 'fatal'));
                    data.broken = hasFatalIssue;
                    debug('_createTestSubmissionWithClient()', 'completed test()');
                    callback(null);
                });
            },
            (callback) => {
                const studentMessage = 'Error creating test submission';
                const courseData = {variant, question, course};
                this._writeCourseIssues(client, courseIssues, variant, authn_user_id, studentMessage, courseData, (err) => {
                    if (ERR(err, callback)) return;
                    debug('_createTestSubmissionWithClient()', `wrote courseIssues: ${courseIssues.length}`);
                    callback(null);
                });
            },
            (callback) => {
                const hasFatalIssue = _.some(_.map(courseIssues, 'fatal'));
                if (hasFatalIssue) data.gradable = false;

                const params = [
                    {}, // submitted_answer
                    data.raw_submitted_answer,
                    data.format_errors,
                    data.gradable,
                    data.broken,
                    null, // credit
                    null, // mode
                    variant.id,
                    authn_user_id,
                ];
                sqldb.callWithClientOneRow(client, 'submissions_insert', params, (err, result) => {
                    if (ERR(err, callback)) return;
                    submission_id = result.rows[0].submission_id;
                    debug('_createTestSubmissionWithClient()', 'inserted', 'submission_id:', submission_id);
                    callback(null);
                });
            },
            (callback) => {
                const params = [
                    submission_id,
                    authn_user_id,
                    data.gradable,
                    data.broken,
                    data.format_errors,
                    data.partial_scores,
                    data.score,
                    data.feedback,
                    {}, // submitted_answer
                    data.params,
                    data.true_answer,
                    false, // is_regrade
                ];
                sqldb.callWithClientOneRow(client, 'grading_jobs_insert', params, (err, result) => {
                    if (ERR(err, callback)) return;
                    grading_job = result.rows[0];
                    debug('_createTestSubmissionWithClient()', 'inserted', 'grading_job.id:', grading_job.id);
                    callback(null);
                });
            },
            (callback) => {
                sqldb.queryWithClientOneRow(client, sql.select_assessment_for_submission, {submission_id}, (err, result) => {
                    if (ERR(err, callback)) return;
                    let assessment_instance_id = result.rows[0].assessment_instance_id;
                    ltiOutcomes.updateScore(assessment_instance_id, client, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                });
            },
        ], (err) => {
            if (ERR(err, callback)) return;
            debug('_createTestSubmissionWithClient()', 'returning', 'submission_id:', submission_id);
            callback(null, submission_id);
        });
    },

    /**
     * Internal worker for testVariant(). Do not call directly.
     * @protected
     *
     * @param {Object} expected_submission - Generated reference submission data.
     * @param {Object} test_submission - Computed submission to be tested.
     * @param {function} callback - A callback(err, courseIssues) function.
     */
    _compareSubmissions(expected_submission, test_submission, callback) {
        const courseIssues = [];

        const checkEqual = (name, var1, var2) => {
            const json1 = jsonStringifySafe(var1);
            const json2 = jsonStringifySafe(var2);
            if (!_.isEqual(var1, var2)) courseIssues.push(new Error(`"${name}" mismatch: expected "${json1}" but got "${json2}"`));
        };

        if (expected_submission.broken) {
            courseIssues.push(new Error('expected_submission is broken, skipping tests'));
            return callback(null, courseIssues);
        }
        if (test_submission.broken) {
            courseIssues.push(new Error('test_submission is broken, skipping tests'));
            return callback(null, courseIssues);
        }
        checkEqual('gradable', expected_submission.gradable, test_submission.gradable);
        checkEqual('format_errors keys', Object.keys(expected_submission.format_errors), Object.keys(test_submission.format_errors));
        if (!test_submission.gradable || !expected_submission.gradable) {
            return callback(null, courseIssues);
        }
        checkEqual('partial_scores', expected_submission.partial_scores, test_submission.partial_scores);
        checkEqual('score', expected_submission.score, test_submission.score);
        callback(null, courseIssues);
    },

    /**
     * Internal worker for _testQuestion(). Do not call directly.
     * Tests a question variant. Issues will be inserted into the issues table.
     * @protected
     *
     * @param {Object} client - SQL client that must be inside a transaction.
     * @param {Object} variant - The variant to submit to.
     * @param {Object} question - The question for the variant.
     * @param {Object} course - The course for the variant.
     * @param {string} test_type - The type of test to run.  Should be one of 'correct', 'incorrect', or 'invalid'.
     * @param {number} authn_user_id - The currently authenticated user.
     * @param {function} callback - A callback(err) function.
     */
    _testVariantWithClient(client, variant, question, course, test_type, authn_user_id, callback) {
        debug('_testVariantWithClient()');
        let expected_submission_id, expected_submission, test_submission_id, test_submission;
        async.series([
            (callback) => {
                this._createTestSubmissionWithClient(client, variant, question, course, test_type, authn_user_id, (err, ret_submission_id) => {
                    if (ERR(err, callback)) return;
                    expected_submission_id = ret_submission_id;
                    debug('_testVariantWithClient()', 'expected_submission_id:', expected_submission_id);
                    callback(null);
                });
            },
            (callback) => {
                sqldb.callWithClientOneRow(client, 'submissions_select', [expected_submission_id], (err, result) => {
                    if (ERR(err, callback)) return;
                    expected_submission = result.rows[0];
                    debug('_testVariantWithClient()', 'selected expected_submission, id:', expected_submission.id);
                    callback(null);
                });
            },
            (callback) => {
                const submission = {
                    variant_id: variant.id,
                    auth_user_id: authn_user_id,
                    submitted_answer: expected_submission.raw_submitted_answer,
                };
                this._saveSubmissionWithClient(client, submission, variant, question, course, (err, ret_submission_id) => {
                    if (ERR(err, callback)) return;
                    test_submission_id = ret_submission_id;
                    debug('_testVariantWithClient()', 'test_submission_id:', test_submission_id);
                    callback(null);
                });
            },
            (callback) => {
                this._gradeVariantWithClient(client, variant, test_submission_id, question, course, authn_user_id, true, (err) => {
                    if (ERR(err, callback)) return;
                    debug('testVariant()', 'graded');
                    callback(null);
                });
            },
            (callback) => {
                sqldb.callWithClientOneRow(client, 'submissions_select', [test_submission_id], (err, result) => {
                    if (ERR(err, callback)) return;
                    test_submission = result.rows[0];
                    debug('_testVariantWithClient()', 'selected test_submission, id:', test_submission.id);
                    callback(null);
                });
            },
            (callback) => {
                this._compareSubmissions(expected_submission, test_submission, (err, courseIssues) => {
                    if (ERR(err, callback)) return;
                    const studentMessage = 'Question test failure';
                    const courseData = {variant, question, course, expected_submission, test_submission};
                    this._writeCourseIssues(client, courseIssues, variant, authn_user_id, studentMessage, courseData, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                });
            },
        ], (err) => {
            if (ERR(err, callback)) return;
            debug('_testVariantWithClient()', 'returning');
            callback(null, expected_submission, test_submission);
        });
    },

    /**
     * Test a question. Issues will be inserted into the issues table.
     *
     * @param {Object} question - The question for the variant.
     * @param {boolean} group_work - If the assessment will support group work.
     * @param {Object} course - The course for the variant.
     * @param {number} authn_user_id - The currently authenticated user.
     * @param {string} test_type - The type of test to run.  Should be one of 'correct', 'incorrect', or 'invalid'.
     * @param {function} callback - A callback(err, variant) function.
     */
    _testQuestion(question, group_work, course_instance, course, test_type, authn_user_id, callback) {
        debug('_testQuestion()');
        let variant, expected_submission = null, test_submission = null;
        sqldb.beginTransaction((err, client, done) => {
            if (ERR(err, callback)) return;
            async.series([
                (callback) => {
                    const instance_question_id = null;
                    const course_instance_id = (course_instance && course_instance.id) || null;
                    const options = {};
                    const require_open = true;
                    this._ensureVariantWithClient(client, question.id, instance_question_id, authn_user_id, authn_user_id, group_work, course_instance_id, course, options, require_open, (err, ret_variant) => {
                        if (ERR(err, callback)) return;
                        variant = ret_variant;
                        debug('_testQuestion()', 'created variant_id: :', variant.id);
                        callback(null);
                    });
                },
                (callback) => {
                    if (variant.broken) return callback(null);
                    this._testVariantWithClient(client, variant, question, course, test_type, authn_user_id, (err, ret_expected_submission, ret_test_submission) => {
                        if (ERR(err, callback)) return;
                        expected_submission = ret_expected_submission;
                        test_submission = ret_test_submission;
                        debug('_testQuestion()', 'tested',
                              'expected_submission_id:', expected_submission ? expected_submission.id : null,
                              'test_submission_id:', test_submission ? test_submission.id : null);
                        callback(null);
                    });
                },
            ], (err) => {
                sqldb.endTransaction(client, done, err, (err) => {
                    if (ERR(err, callback)) return;
                    debug('_testQuestion()', 'returning');
                    callback(null, variant, expected_submission, test_submission);
                });
            });
        });
    },

    /**
     * Internal worker for _testQuestion(). Do not call directly.
     * Runs a single test.
     * @protected
     *
     * @param {Object} logger - The server job to run within.
     * @param {boolean} showDetails - Whether to display test data details.
     * @param {Object} question - The question for the variant.
     * @param {boolean} group_work - If the assessment will support group work.
     * @param {Object} course - The course for the variant.
     * @param {string} test_type - The type of test to run.  Should be one of 'correct', 'incorrect', or 'invalid'.
     * @param {number} authn_user_id - The currently authenticated user.
     * @param {function} callback - A callback(err, success) function.
     */
    _runTest(logger, showDetails, question, group_work, course_instance, course, test_type, authn_user_id, callback) {
        let variant, expected_submission, test_submission, success = true;
        async.series([
            (callback) => {
                logger.verbose('Testing ' + question.qid);
                this._testQuestion(question, group_work, course_instance, course, test_type, authn_user_id, (err, ret_variant, ret_expected_submission, ret_test_submission) => {
                    if (ERR(err, callback)) return;
                    variant = ret_variant;
                    expected_submission = ret_expected_submission;
                    test_submission = ret_test_submission;
                    callback(null);
                });
            },
            (callback) => {
                if (!showDetails) return callback(null);
                const variantKeys = ['broken', 'options', 'params', 'true_answer', 'variant_seed'];
                const submissionKeys = ['broken', 'correct', 'feedback', 'format_errors', 'gradable',
                                        'grading_method', 'partial_scores', 'raw_submitted_answer',
                                        'score', 'submitted_answer', 'true_answer'];
                logger.verbose('variant:\n' + jsonStringifySafe(_.pick(variant, variantKeys), null, '    '));
                if (_.isObject(expected_submission)) {
                    logger.verbose('expected_submission:\n' + jsonStringifySafe(_.pick(expected_submission, submissionKeys), null, '    '));
                }
                if (_.isObject(test_submission)) {
                    logger.verbose('test_submission:\n' + jsonStringifySafe(_.pick(test_submission, submissionKeys), null, '    '));
                }
                callback(null);
            },
            (callback) => {
                sqldb.query(sql.select_issues_for_variant, {variant_id: variant.id}, (err, result) => {
                    if (ERR(err, () => {})) {
                        return callback(err);
                    }

                    if (result.rowCount > 0) {
                        success = false;
                        logger.verbose(`ERROR: ${result.rowCount} issues encountered during test.`);
                    } else {
                        logger.verbose('Success: no issues during test');
                    }
                    callback(null);
                });
            },
        ], (err) => {
            if (ERR(err, callback)) return;
            callback(null, success);
        });
    },

    /**
     * Start a job sequence to test a question.
     *
     * @param {number} count - The number of times to test, will run each possible test ('correct, 'incorrect,' invalid') this many times.
     * @param {boolean} showDetails - Whether to display test data details.
     * @param {Object} question - The question for the variant.
     * @param {boolean} group_work - If the assessment will support group work
     * @param {Object} course_instance - The course instance for the variant; may be null for instructor questions
     * @param {Object} course - The course for the variant.
     * @param {number} authn_user_id - The currently authenticated user.
     * @param {function} callback - A callback(err, job_sequence_id) function.
     */
    startTestQuestion(count, showDetails, question, group_work, course_instance, course, authn_user_id, callback) {
        let success = true;
        const options = {
            course_id: course.id,
            course_instance_id: null,
            assessment_id: null,
            user_id: authn_user_id,
            authn_user_id: authn_user_id,
            type: 'test_question',
            description: 'Test ' + question.qid,
        };
        let test_types = ['correct', 'incorrect', 'invalid'];

        serverJobs.createJobSequence(options, (err, job_sequence_id) => {
            if (ERR(err, callback)) return;
            callback(null, job_sequence_id);

            // We've now triggered the callback to our caller, but we
            // continue executing below to launch the jobs themselves.

            var jobOptions = {
                course_id: course.id,
                course_instance_id: null,
                assessment_id: null,
                user_id: authn_user_id,
                authn_user_id: authn_user_id,
                type: 'test_question',
                description: 'Test ' + question.qid,
                job_sequence_id: job_sequence_id,
                last_in_sequence: true,
            };
            serverJobs.createJob(jobOptions, (err, job) => {
                if (err) {
                    logger.error('Error in createJob()', err);
                    serverJobs.failJobSequence(job_sequence_id);
                    return;
                }

                async.eachSeries(_.range(count * test_types.length), (iter, callback) => {
                    let type = test_types[iter % test_types.length];
                    job.verbose(`Test ${Math.floor(iter/test_types.length) + 1}, type ${type}`);
                    this._runTest(job, showDetails, question, group_work, course_instance, course, type, authn_user_id, (err, ret_success) => {
                        if (ERR(err, callback)) return;
                        success = success && ret_success;
                        callback(null);
                    });
                }, (err) => {
                    if (ERR(err, () => {})) return job.fail(err);
                    if (!success) return job.fail('Some tests failed. See the "Errors" page for details.');
                    job.succeed();
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
     * @param {Object} course_instance - The course_instance for the variant.
     * @param {Object} locals - The current locals for the page response.
     * @param {function} callback - A callback(err, courseIssues, htmls) function.
     */
    _render(renderSelection, variant, question, submission, submissions, course, course_instance, locals, callback) {
        questionServers.getModule(question.type, (err, questionModule) => {
            if (ERR(err, callback)) return;
            questionModule.render(renderSelection, variant, question, submission, submissions, course, course_instance, locals, (err, courseIssues, htmls) => {
                if (ERR(err, callback)) return;

                const studentMessage = 'Error rendering question';
                const courseData = {variant, question, submission, course};
                // locals.authn_user may not be populated when rendering a panel
                const user_id = (locals && locals.authn_user) ? locals.authn_user.user_id : null;
                this._writeCourseIssues(null, courseIssues, variant, user_id, studentMessage, courseData, (err) => {
                    if (ERR(err, callback)) return;
                    return callback(null, htmls);
                });
            });
        });
    },

    /**
     * Internal helper function to generate URLs that are used to render
     * question panels.
     *
     * @param  {String} urlPrefix         The prefix of the generated URLs.
     * @param  {Object} variant           The variant object for this question.
     * @param  {Object} question          The question.
     * @param  {Object} instance_question The instance question.
     * @param  {Object} assessment        The assessment.
     * @return {Object}                   An object containing the named URLs.
     */
    _buildQuestionUrls(urlPrefix, variant, question, instance_question, assessment) {
        const urls = {};

        if (!assessment) {
            // instructor question pages
            const questionUrl = urlPrefix + '/question/' + question.id + '/';
            urls.newVariantUrl = questionUrl + 'preview/';
            urls.tryAgainUrl = questionUrl + 'preview/';
            urls.reloadUrl = questionUrl  + 'preview/' + '?variant_id=' + variant.id;
            urls.clientFilesQuestionUrl = questionUrl + 'clientFilesQuestion';

            // necessary for backward compatibility
            urls.calculationQuestionFileUrl = questionUrl + 'file';

            // FIXME: broken?
            urls.calculationQuestionGeneratedFileUrl = questionUrl + 'generatedFilesQuestion';

            urls.clientFilesCourseUrl = urlPrefix + '/clientFilesCourse';
            urls.clientFilesQuestionGeneratedFileUrl = questionUrl + 'generatedFilesQuestion/variant/' + variant.id;
            urls.baseUrl = urlPrefix;
        } else {
            // student question pages
            const iqUrl = urlPrefix + '/instance_question/' + instance_question.id + '/';
            urls.newVariantUrl = iqUrl;
            urls.tryAgainUrl = iqUrl;
            urls.reloadUrl = iqUrl + '?variant_id=' + variant.id;
            urls.clientFilesQuestionUrl = iqUrl + 'clientFilesQuestion';

            // necessary for backward compatibility
            urls.calculationQuestionFileUrl = iqUrl + 'file';

            // FIXME: broken?
            urls.calculationQuestionGeneratedFileUrl = iqUrl + 'generatedFilesQuestion/variant/' + variant.id;

            urls.clientFilesCourseUrl = urlPrefix + '/clientFilesCourse';
            urls.clientFilesQuestionGeneratedFileUrl = iqUrl + 'generatedFilesQuestion/variant/' + variant.id;
            urls.baseUrl = urlPrefix;
        }

        if (variant.workspace_id) {
            urls.workspaceUrl = `/pl/workspace/${variant.workspace_id}`;
        }

        return urls;
    },

    _buildLocals(variant, question, instance_question, assessment, assessment_instance, assessment_question, overlay_grading_interface) {
        const locals = {};

        locals.showGradeButton = false;
        locals.showSaveButton = false;
        locals.disableGradeButton = false;
        locals.showNewVariantButton = false;
        locals.showTryAgainButton = false;
        locals.showManualGradingMsg = false;
        locals.showSubmissions = false;
        locals.showFeedback = false;
        locals.showTrueAnswer = false;
        locals.showGradingRequested = false;
        locals.allowAnswerEditing = false;
        locals.hasAttemptsOtherVariants = false;
        locals.variantAttemptsLeft = 0;
        locals.variantAttemptsTotal = 0;
        locals.submissions = [];

        if (!assessment) {
            // instructor question pages
            locals.showGradeButton = true;
            locals.showSaveButton = true;
            locals.allowAnswerEditing = true;
            locals.showNewVariantButton = true;
        } else {
            // student question pages
            if (assessment.type == 'Homework') {
                locals.showGradeButton = true;
                locals.showSaveButton = true;
                locals.allowAnswerEditing = true;
                if (!question.single_variant) {
                    locals.hasAttemptsOtherVariants = true;
                    locals.variantAttemptsLeft = assessment_question.tries_per_variant - variant.num_tries;
                    locals.variantAttemptsTotal = assessment_question.tries_per_variant;
                }
            }
            if (assessment.type == 'Exam') {
                if (assessment_instance.open && instance_question.open) {
                    locals.showGradeButton = true;
                    locals.showSaveButton = true;
                    locals.allowAnswerEditing = true;
                    locals.variantAttemptsLeft = instance_question.points_list.length;
                    locals.variantAttemptsTotal = instance_question.points_list_original.length;
                } else {
                    locals.showTrueAnswer = true;
                }
            }
            if (!assessment.allow_real_time_grading) {
                locals.showGradeButton = false;
            }
            if (instance_question.allow_grade_left_ms > 0) {
                locals.disableGradeButton = true;
            }
        }

        locals.showFeedback = true;
        if (!variant.open
            || (instance_question && !instance_question.open)
            || (assessment_instance && !assessment_instance.open)) {
            locals.showGradeButton = false;
            locals.showSaveButton = false;
            locals.allowAnswerEditing = false;
            if (assessment && assessment.type == 'Homework') {
                locals.showTryAgainButton = true;
                locals.showTrueAnswer = true;
            }
        }

        // Used for "auth" for external grading realtime results
        // ID is coerced to a string so that it matches what we get back from the client
        locals.variantToken = csrf.generateToken({variantId: '' + variant.id}, config.secretKey);

        if (variant.broken) {
            locals.showGradeButton = false;
            locals.showSaveButton = false;
            locals.showTryAgainButton = true;
        }

        if (question && question.grading_method == 'Manual') {
            locals.showGradeButton = false;
            locals.showManualGradingMsg = true;
        }

        if (overlay_grading_interface) {
            locals.showGradeButton = false;
            locals.showSaveButton = false;
            locals.showNewVariantButton = false;
            locals.showTryAgainButton = false;
            locals.allowAnswerEditing = false;
        }
        

        return locals;
    },

    /**
     * Render all information needed for a question.
     *
     * @param {?number} variant_id - The variant to render, or null if it should be generated.
     * @param {?string} variant_seed - Random seed for variant, or null if it should be generated.
     * @param {Object} locals - The current locals structure to read/write.
     * @param {function} callback - A callback(err) function.
     */
    getAndRenderVariant(variant_id, variant_seed, locals, callback) {
        async.series([
            (callback) => {
                if (variant_id != null) {
                    sqldb.callOneRow('variants_select', [variant_id], (err, result) => {
                        if (ERR(err, callback)) return;
                        debug('variants_select', result.rows[0].variant);
                        _.assign(locals, result.rows[0]);
                        callback(null);
                    });
                } else {
                    const require_open = (locals.assessment && locals.assessment.type != 'Exam');
                    const instance_question_id = locals.instance_question ? locals.instance_question.id : null;
                    const course_instance_id = locals.course_instance_id || (locals.course_instance && locals.course_instance.id) || null;
                    const options = {
                        variant_seed,
                    };
                    const assessmentGroupWork = locals.assessment ? locals.assessment.group_work : false;
                    this.ensureVariant(locals.question.id, instance_question_id, locals.user.user_id, locals.authn_user.user_id, assessmentGroupWork, course_instance_id, locals.course, options, require_open, (err, variant) => {
                        if (ERR(err, callback)) return;
                        locals.variant = variant;
                        callback(null);
                    });
                }
            },
            (callback) => {
                const {
                    urlPrefix,
                    variant,
                    question,
                    instance_question,
                    assessment,
                } = locals;

                const urls = this._buildQuestionUrls(urlPrefix, variant, question, instance_question, assessment);
                _.assign(locals, urls);
                callback(null);
            },
            (callback) => {
                const {
                    variant,
                    question,
                    instance_question,
                    assessment,
                    assessment_instance,
                    assessment_question,
                    overlayGradingInterface,
                } = locals;

                const newLocals = this._buildLocals(variant, question, instance_question, assessment, assessment_instance, assessment_question, overlayGradingInterface);
                _.assign(locals, newLocals);
                callback(null);
            },
            (callback) => {
                var params = {
                    variant_id: locals.variant.id,
                    req_date: locals.req_date,
                };
                sqldb.query(sql.select_submissions, params, (err, result) => {
                    if (ERR(err, callback)) return;
                    if (result.rowCount >= 1) {
                        locals.submissions = result.rows.map((s) => ({
                            grading_job_stats: this._buildGradingJobStats(s.grading_job),
                            ...s,
                        }));
                        locals.submission = locals.submissions[0]; // most recent submission

                        locals.showSubmissions = true;
                        if (!locals.assessment) {
                            // instructor question pages
                            locals.showTrueAnswer = true;
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
                const renderSelection = {
                    'header': true,
                    'question': true,
                    'submissions': locals.showSubmissions,
                    'answer': locals.showTrueAnswer,
                };
                this._render(renderSelection, locals.variant, locals.question, locals.submission, locals.submissions, locals.course, locals.course_instance, locals, (err, htmls) => {
                    if (ERR(err, callback)) return;
                    locals.extraHeadersHtml = htmls.extraHeadersHtml;
                    locals.questionHtml = htmls.questionHtml;
                    locals.submissionHtmls = htmls.submissionHtmls;
                    locals.answerHtml = htmls.answerHtml;
                    callback(null);
                });
            },
            (callback) => {
                // load issues last in case there are issues from rendering
                const params = {
                    variant_id: locals.variant.id,
                };
                sqldb.query(sql.select_issues, params, (err, result) => {
                    if (ERR(err, callback)) return;
                    locals.issues = result.rows;
                    callback(null);
                });
            },
            (callback) => {
                var questionJson = JSON.stringify({
                    questionFilePath: locals.calculationQuestionFileUrl,
                    questionGeneratedFilePath: locals.calculationQuestionGeneratedFileUrl,
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
                locals.questionJsonBase64 = (Buffer.from(encodedJson)).toString('base64');
                locals.video = null;
                locals.iqqrcode = new QR({
                    content: `${config.PLpeekUrl}/${locals.variant.instance_question_id}`,
                }).svg();
                callback(null);
            },
        ], (err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },

    _buildGradingJobStats(job) {
        if (job) {
            const phases = [];
            const totalDuration = moment.duration(moment(job.grading_requested_at).diff(job.graded_at)).asMilliseconds();
            const formatDiff = (start, end, addToPhases = true) => {
                const duration = moment.duration(moment(end).diff(start)).asMilliseconds();
                if (addToPhases) {
                    const percentage = -1 * (duration / totalDuration);
                    // Round down to avoid width being greater than 100% with floating point errors
                    phases.push(Math.floor(percentage * 1000) / 10);
                }
                return moment.utc(duration).format('s.SSS');
            };

            return {
                submitDuration: formatDiff(job.grading_requested_at, job.grading_submitted_at),
                queueDuration: formatDiff(job.grading_submitted_at, job.grading_received_at),
                prepareDuration: formatDiff(job.grading_received_at, job.grading_started_at),
                runDuration: formatDiff(job.grading_started_at, job.grading_finished_at),
                reportDuration: formatDiff(job.grading_finished_at, job.graded_at),
                totalDuration: formatDiff(job.grading_requested_at, job.graded_at, false),
                phases,
            };
        }

        return null;
    },

    /**
     * Renders the panels that change when a grading job is completed; used to
     * send real-time results back to the client. This includes the submission
     * panel and the score panel
     * @param  {number}   grading_job_id  The id of the grading job
     * @param  {String}   urlPrefix       URL prefix to be used when rendering
     * @param  {String}   questionContext The rendering context of this question
     * @param  {String}   csrfToken       CSRF token for this question page
     * @param  {Function} callback        Receives an error or an object
     *                                    containing the panels that were rendered
     */
    renderPanelsForSubmission(submission_id, urlPrefix, questionContext, csrfToken, callback) {
        const params = {
            submission_id,
        };
        sqldb.queryOneRow(sql.select_submission_info, params, (err, results) => {
            if (ERR(err, callback)) return;

            const renderSelection = {
                'submissions': true,
            };
            const {
                variant,
                submission,
                instance_question,
                question,
                assessment_question,
                assessment_instance,
                assessment,
                assessment_set,
                course,
                course_instance,
                submission_index,
                submission_count,
                grading_job,
                grading_job_id,
                grading_job_status,
                formatted_date,
            } = results.rows[0];

            const panels = {
                submissionPanel: null,
                scorePanel: null,
            };

            // Fake locals. Yay!
            const locals = {};
            config.setLocals(locals);
            _.assign(locals, this._buildQuestionUrls(urlPrefix, variant, question, instance_question, assessment));
            _.assign(locals, this._buildLocals(variant, question, instance_question, assessment, assessment_instance, assessment_question));

            async.parallel([
                (callback) => {
                    // Render the submission panel
                    const submissions = [submission];

                    this._render(renderSelection, variant, question, submission, submissions, course, course_instance, locals, (err, htmls) => {
                        if (ERR(err, callback)) return;
                        submission.grading_job_id = grading_job_id;
                        submission.grading_job_status = grading_job_status;
                        submission.formatted_date = formatted_date;
                        submission.grading_job_stats = this._buildGradingJobStats(grading_job);

                        const renderParams = {
                            course_instance,
                            question,
                            submission,
                            submissionHtml: htmls.submissionHtmls[0],
                            submissionIdx: submission_index,
                            submissionCount: submission_count,
                            urlPrefix,
                            plainUrlPrefix: config.urlPrefix,
                        };
                        const templatePath = path.join(__dirname, '..', 'pages', 'partials', 'submission.ejs');
                        ejs.renderFile(templatePath, renderParams, (err, html) => {
                            if (ERR(err, callback)) return;
                            panels.submissionPanel = html;
                            callback(null);
                        });
                    });
                },
                (callback) => {
                    // Render the question score panel

                    // The score panel can and should only be rendered for
                    // questions that are part of an assessment
                    if (variant.instance_question_id == null) {
                        // If the variant does not have an instance question,
                        // it's not part of an assessment
                        return callback(null);
                    }

                    const renderParams = {
                        instance_question,
                        assessment_question,
                        assessment_instance,
                        assessment,
                        variant,
                        __csrf_token: csrfToken,
                    };
                    const templatePath = path.join(__dirname, '..', 'pages', 'partials', 'questionScorePanel.ejs');
                    ejs.renderFile(templatePath, renderParams, (err, html) => {
                        if (ERR(err, callback)) return;
                        panels.questionScorePanel = html;
                        callback(null);
                    });
                },
                (callback) => {
                    // Render the assessment score panel

                    // As usual, only render if this variant is part of an
                    // assessment
                    if (variant.instance_question_id == null) {
                        return callback(null);
                    }
                    const renderParams = {
                        assessment_instance,
                        assessment,
                        assessment_set,
                        urlPrefix,
                    };

                    const templatePath = path.join(__dirname, '..', 'pages', 'partials', 'assessmentScorePanel.ejs');
                    ejs.renderFile(templatePath, renderParams, (err, html) => {
                        if (ERR(err, callback)) return;
                        panels.assessmentScorePanel = html;
                        callback(null);
                    });
                },
                (callback) => {
                    // Render the question panel footer
                    const renderParams = {
                        variant,
                        question,
                        assessment_question,
                        instance_question,
                        question_context: questionContext,
                        __csrf_token: csrfToken,
                    };
                    _.assign(renderParams, locals);

                    const templatePath = path.join(__dirname, '..', 'pages', 'partials', 'questionFooter.ejs');
                    ejs.renderFile(templatePath, renderParams, (err, html) => {
                        if (ERR(err, callback)) return;
                        panels.questionPanelFooter = html;
                        callback(null);
                    });
                },
            ], (err) => {
                if (ERR(err, callback)) return;
                callback(null, panels);
            });
        });
    },
};
