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
const showdown = require('showdown');

const config = require('./config');
const csrf = require('./csrf');
const externalGrader = require('./externalGrader');
const logger = require('./logger');
const serverJobs = require('./server-jobs');
const ltiOutcomes = require('../lib/ltiOutcomes');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
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

module.exports = {
  /**
   * Internal function, do not call directly. Write the courseIssues for a variant to the DB.
   * @protected
   *
   * @param {Array} courseIssues - List of issue objects for to be written.
   * @param {Object} variant - The variant associated with the issues.
   * @param {number} authn_user_id - The currently authenticated user.
   * @param {string} studentMessage - The message to display to the student.
   * @param {Object} courseData - Arbitrary data to be associated with the issues.
   * @param {function} callback - A callback(err) function.
   */
  _writeCourseIssues(courseIssues, variant, authn_user_id, studentMessage, courseData, callback) {
    async.eachSeries(
      courseIssues,
      (courseErr, callback) => {
        const params = [
          variant.id,
          studentMessage,
          courseErr.toString(), // instructor message
          false, // manually_reported
          true, // course_caused
          courseData,
          { stack: courseErr.stack, courseErrData: courseErr.data }, // system_data
          authn_user_id,
        ];
        sqldb.call('issues_insert_for_variant', params, (err) => {
          if (ERR(err, callback)) return;
          return callback(null);
        });
      },
      (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      }
    );
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
        if (question.workspace_image !== null) {
          // if workspace, add graded files to params
          variant.params['_workspace_required_file_names'] = question.workspace_graded_files || [];
          if (!('_required_file_names' in variant.params)) {
            variant.params['_required_file_names'] = [];
          }
          variant.params['_required_file_names'] = variant.params['_required_file_names'].concat(
            question.workspace_graded_files
          );
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
        const courseData = { variant, question, course };
        module.exports._writeCourseIssues(
          courseIssues,
          variant,
          authn_user_id,
          studentMessage,
          courseData,
          (err) => {
            if (ERR(err, callback)) return;

            return callback(null, fileData);
          }
        );
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
  _selectQuestion(question_id, instance_question_id, callback) {
    if (question_id != null) {
      sqldb.callOneRow('questions_select', [question_id], (err, result) => {
        if (ERR(err, callback)) return;
        const question = result.rows[0];
        callback(null, question);
      });
    } else {
      if (instance_question_id == null) {
        return callback(new Error('question_id and instance_question_id cannot both be null'));
      }
      sqldb.callOneRow(
        'instance_questions_select_question',
        [instance_question_id],
        (err, result) => {
          if (ERR(err, callback)) return;
          const question = result.rows[0];
          callback(null, question);
        }
      );
    }
  },

  /**
   * Internal function, do not call directly. Create a variant object, and write it to the DB.
   * @protected
   *
   * @param {?number} question_id - The question for the new variant. Can be null if instance_question_id is provided.
   * @param {?number} instance_question_id - The instance question for the new variant, or null for a floating variant.
   * @param {number} user_id - The user for the new variant.
   * @param {number} authn_user_id - The current authenticated user.
   * @param {boolean} group_work - If the assessment will support group work.
   * @param {Object} course - The course for the variant.
   * @param {Object} options - Options controlling the creation: options = {variant_seed}
   * @param {function} callback - A callback(err, variant) function.
   */
  _makeAndInsertVariant(
    question_id,
    instance_question_id,
    user_id,
    authn_user_id,
    group_work,
    course_instance_id,
    course,
    options,
    require_open,
    callback
  ) {
    module.exports._selectQuestion(question_id, instance_question_id, (err, question) => {
      if (ERR(err, callback)) return;
      module.exports._makeVariant(question, course, options, (err, courseIssues, variant) => {
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
          require_open,
        ];
        sqldb.callOneRow('variants_insert', params, (err, result) => {
          if (ERR(err, callback)) return;
          const variant = result.rows[0].variant;
          debug('variants_insert', variant);

          const studentMessage = 'Error creating question variant';
          const courseData = { variant, question, course };
          module.exports._writeCourseIssues(
            courseIssues,
            variant,
            authn_user_id,
            studentMessage,
            courseData,
            (err) => {
              if (ERR(err, callback)) return;
              return callback(null, variant);
            }
          );
        });
      });
    });
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
  ensureVariant(
    question_id,
    instance_question_id,
    user_id,
    authn_user_id,
    group_work,
    course_instance_id,
    course,
    options,
    require_open,
    callback
  ) {
    if (instance_question_id != null) {
      // see if we have a useable existing variant, otherwise
      // make a new one
      var params = [instance_question_id, require_open];
      sqldb.call('instance_questions_select_variant', params, (err, result) => {
        if (ERR(err, callback)) return;
        const variant = result.rows[0].variant;
        if (variant != null) {
          debug('instance_questions_select_variant not null', variant);
          return callback(null, variant);
        }
        module.exports._makeAndInsertVariant(
          question_id,
          instance_question_id,
          user_id,
          authn_user_id,
          group_work,
          course_instance_id,
          course,
          options,
          require_open,
          (err, variant) => {
            if (ERR(err, callback)) return;
            debug(
              'instance_questions_select_variant was null, run through _makeAndInsertVariant',
              variant
            );
            callback(null, variant);
          }
        );
      });
    } else {
      // if we don't have instance_question_id, just make a new variant
      module.exports._makeAndInsertVariant(
        question_id,
        instance_question_id,
        user_id,
        authn_user_id,
        group_work,
        course_instance_id,
        course,
        options,
        require_open,
        (err, variant) => {
          if (ERR(err, callback)) return;
          callback(null, variant);
        }
      );
    }
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
    debug('saveSubmission()');
    submission.raw_submitted_answer = submission.submitted_answer;
    submission.gradable = true;
    let questionModule, courseIssues, data, submission_id, workspace_id, zipPath;
    async.series(
      [
        (callback) => {
          // if workspace, get workspace_id
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
        (callback) => {
          // if we have a workspace and any files to be graded, get the files
          if (
            workspace_id == null ||
            !question.workspace_graded_files ||
            !question.workspace_graded_files.length
          ) {
            debug('saveSubmission()', 'not getting workspace graded files');
            return callback(null);
          }
          util.callbackify(workspaceHelper.getGradedFiles)(workspace_id, (err, result) => {
            if (ERR(err, callback)) return;
            zipPath = result;
            debug('saveSubmission()', `saved graded files: ${zipPath}`);
            callback(null);
          });
        },
        async () => {
          // if we have workspace files, encode them into _files
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
            debug('saveSubmission()', 'loaded questionModule');
            callback(null);
          });
        },
        (callback) => {
          questionModule.parse(
            submission,
            variant,
            question,
            course,
            (err, ret_courseIssues, ret_data) => {
              if (ERR(err, callback)) return;
              courseIssues = ret_courseIssues;
              data = ret_data;

              debug('saveSubmission()', 'completed parse()');
              callback(null);
            }
          );
        },
        (callback) => {
          const studentMessage = 'Error parsing submission';
          const courseData = { variant, question, submission, course };
          module.exports._writeCourseIssues(
            courseIssues,
            variant,
            submission.auth_user_id,
            studentMessage,
            courseData,
            (err) => {
              if (ERR(err, callback)) return;
              debug('saveSubmission()', `wrote courseIssues: ${courseIssues.length}`);
              callback(null);
            }
          );
        },
        (callback) => {
          const hasFatalIssue = _.some(_.map(courseIssues, 'fatal'));
          if (hasFatalIssue) data.gradable = false;
          data.broken = hasFatalIssue;

          const params = [
            data.submitted_answer,
            data.raw_submitted_answer,
            data.format_errors,
            data.gradable,
            data.broken,
            data.true_answer,
            false, // regradable
            submission.credit,
            submission.mode,
            submission.variant_id,
            submission.auth_user_id,
          ];
          sqldb.callOneRow('submissions_insert', params, (err, result) => {
            if (ERR(err, callback)) return;
            submission_id = result.rows[0].submission_id;
            debug('saveSubmission()', 'inserted', 'submission_id:', submission_id);
            callback(null);
          });
        },
      ],
      (err) => {
        if (ERR(err, callback)) return;
        debug('saveSubmission()', 'returning', 'submission_id:', submission_id);
        callback(null, submission_id);
      }
    );
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
  gradeVariant(
    variant,
    check_submission_id,
    question,
    course,
    authn_user_id,
    overrideGradeRateCheck,
    callback
  ) {
    debug('_gradeVariant()');
    let questionModule, courseIssues, data, submission, grading_job;
    async.series(
      [
        (callback) => {
          if (question.grading_method === 'Manual') {
            // The button to make a submission won't be available to students
            // on manualy-graded questions; this is just here to handle the
            // case where someone tries to be clever and manually post a response
            // with a `grade` action.
            return callback(new NoSubmissionError());
          }
          callback(null);
        },
        (callback) => {
          var params = [variant.id, check_submission_id];
          sqldb.callZeroOrOneRow(
            'variants_select_submission_for_grading',
            params,
            (err, result) => {
              if (ERR(err, callback)) return;
              if (result.rowCount === 0) return callback(new NoSubmissionError());
              submission = result.rows[0];
              debug('_gradeVariant()', 'selected submission', 'submission.id:', submission.id);
              callback(null);
            }
          );
        },
        (callback) => {
          if (overrideGradeRateCheck) return callback(null);
          var params = [variant.instance_question_id];
          sqldb.callZeroOrOneRow('instance_questions_next_allowed_grade', params, (err, result) => {
            if (ERR(err, callback)) return;
            debug(
              '_gradeVariant()',
              'checked grade rate',
              'allow_grade_left_ms:',
              result.rows[0].allow_grade_left_ms
            );
            if (result.rows[0].allow_grade_left_ms > 0) return callback(new NoSubmissionError());
            callback(null);
          });
        },
        (callback) => {
          const params = [submission.id, authn_user_id];
          sqldb.callOneRow('grading_jobs_insert', params, (err, result) => {
            if (ERR(err, callback)) return;

            grading_job = result.rows[0];
            debug('_gradeVariant()', 'inserted', 'grading_job.id:', grading_job.id);
            callback(null);
          });
        },
        (callback) => {
          questionServers.getModule(question.type, (err, ret_questionModule) => {
            if (ERR(err, callback)) return;
            questionModule = ret_questionModule;
            debug('_gradeVariant()', 'loaded questionModule');
            callback(null);
          });
        },
        (callback) => {
          if (question.grading_method === 'Internal') {
            // for Internal grading we call the grading code
            questionModule.grade(
              submission,
              variant,
              question,
              course,
              (err, ret_courseIssues, ret_data) => {
                if (ERR(err, callback)) return;
                courseIssues = ret_courseIssues;
                data = ret_data;
                const hasFatalIssue = _.some(_.map(courseIssues, 'fatal'));
                if (hasFatalIssue) data.gradable = false;
                data.broken = hasFatalIssue;
                debug('_gradeVariant()', 'completed grade()', 'hasFatalIssue:', hasFatalIssue);
                callback(null);
              }
            );
          } else {
            // for External or Manual grading we don't do anything
            courseIssues = [];
            data = {};
            callback(null);
          }
        },
        (callback) => {
          const studentMessage = 'Error grading submission';
          const courseData = { variant, question, submission, course };
          module.exports._writeCourseIssues(
            courseIssues,
            variant,
            submission.auth_user_id,
            studentMessage,
            courseData,
            (err) => {
              if (ERR(err, callback)) return;
              debug('_gradeVariant()', `wrote courseIssues: ${courseIssues.length}`);
              callback(null);
            }
          );
        },
        (callback) => {
          if (question.grading_method !== 'Internal') {
            // We haven't actually graded this question yet - don't attempt
            // to update the grading job or submission.
            return callback(null);
          }

          const params = [
            grading_job.id,
            // `received_time` and `start_time` were already set when the
            // grading job was inserted, so they'll remain unchanged.
            // `finish_time` will be set to `now()` by this sproc.
            null, // received_time
            null, // start_time
            null, // finish_time
            data.submitted_answer,
            data.format_errors,
            data.gradable,
            data.broken,
            data.params,
            data.true_answer,
            data.feedback,
            data.partial_scores,
            data.score,
            data.v2_score,
          ];
          sqldb.callOneRow('grading_jobs_update_after_grading', params, (err, result) => {
            if (ERR(err, callback)) return;

            // If the submission was marked invalid during grading the grading
            // job will be marked ungradable and we should bail here to prevent
            // LTI updates.
            grading_job = result.rows[0];
            if (!grading_job.gradable) return callback(new NoSubmissionError());

            debug('_gradeVariant()', 'inserted', 'grading_job.id:', grading_job.id);
            callback(null);
          });
        },
        (callback) => {
          sqldb.queryOneRow(
            sql.select_assessment_for_submission,
            { submission_id: submission.id },
            (err, result) => {
              if (ERR(err, callback)) return;
              let assessment_instance_id = result.rows[0].assessment_instance_id;
              ltiOutcomes.updateScore(assessment_instance_id, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
              });
            }
          );
        },
      ],
      (err) => {
        // catch NoSubmissionError as we are just using it to exit with no action
        if (err instanceof NoSubmissionError) {
          debug('_gradeVariant()', 'no submissions for grading, skipping');
          err = null;
        }
        if (ERR(err, callback)) return;
        debug('_gradeVariant()', 'success');
        // data and grading_job might not be defined if we bailed out early above
        if (data && !data.broken && grading_job && grading_job.grading_method === 'External') {
          // We need to submit this external grading job.
          externalGrader.beginGradingJob(grading_job.id, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          });
        } else {
          callback(null);
        }
      }
    );
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
    async.series(
      [
        (callback) => {
          module.exports.saveSubmission(
            submission,
            variant,
            question,
            course,
            (err, ret_submission_id) => {
              if (ERR(err, callback)) return;
              submission_id = ret_submission_id;
              debug('saveAndGradeSubmission()', 'submission_id:', submission_id);
              callback(null);
            }
          );
        },
        (callback) => {
          module.exports.gradeVariant(
            variant,
            submission_id,
            question,
            course,
            submission.auth_user_id,
            overrideGradeRateCheck,
            (err, ret_grading_job_id) => {
              if (ERR(err, callback)) return;
              grading_job_id = ret_grading_job_id;
              debug('saveAndGradeSubmission()', 'graded');
              callback(null);
            }
          );
        },
      ],
      (err) => {
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
      }
    );
  },

  /**
   * Internal worker for testVariant(). Do not call directly.
   * @protected
   *
   * @param {Object} variant - The variant to submit to.
   * @param {Object} question - The question for the variant.
   * @param {Object} course - The course for the variant.
   * @param {string} test_type - The type of test to run.  Should be one of 'correct', 'incorrect', or 'invalid'.
   * @param {number} authn_user_id - The currently authenticated user.
   * @param {function} callback - A callback(err, submission_id) function.
   */
  _createTestSubmission(variant, question, course, test_type, authn_user_id, callback) {
    debug('_createTestSubmission()');
    if (question.type !== 'Freeform') return callback(new Error('question.type must be Freeform'));
    let questionModule, courseIssues, data, submission_id, grading_job;
    async.series(
      [
        (callback) => {
          questionServers.getModule(question.type, (err, ret_questionModule) => {
            if (ERR(err, callback)) return;
            questionModule = ret_questionModule;
            debug('_createTestSubmission()', 'loaded questionModule');
            callback(null);
          });
        },
        (callback) => {
          questionModule.test(
            variant,
            question,
            course,
            test_type,
            (err, ret_courseIssues, ret_data) => {
              if (ERR(err, callback)) return;
              courseIssues = ret_courseIssues;
              data = ret_data;
              const hasFatalIssue = _.some(_.map(courseIssues, 'fatal'));
              data.broken = hasFatalIssue;
              debug('_createTestSubmission()', 'completed test()');
              callback(null);
            }
          );
        },
        (callback) => {
          const studentMessage = 'Error creating test submission';
          const courseData = { variant, question, course };
          module.exports._writeCourseIssues(
            courseIssues,
            variant,
            authn_user_id,
            studentMessage,
            courseData,
            (err) => {
              if (ERR(err, callback)) return;
              debug('_createTestSubmission()', `wrote courseIssues: ${courseIssues.length}`);
              callback(null);
            }
          );
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
            // The `test` phase is not allowed to mutate `correct_answers`
            // (aliased here to `true_answer`), so we just pick the original
            // `true_answer` so we can use our standard `submissions_insert`
            // sproc.
            variant.true_answer,
            true, // regradable
            null, // credit
            null, // mode
            variant.id,
            authn_user_id,
          ];
          sqldb.callOneRow('submissions_insert', params, (err, result) => {
            if (ERR(err, callback)) return;
            submission_id = result.rows[0].submission_id;
            debug('_createTestSubmission()', 'inserted', 'submission_id:', submission_id);
            callback(null);
          });
        },
        (callback) => {
          const params = [submission_id, authn_user_id];
          sqldb.callOneRow('grading_jobs_insert', params, (err, result) => {
            if (ERR(err, callback)) return;
            grading_job = result.rows[0];
            debug('_createTestSubmission()', 'inserted', 'grading_job_id:', grading_job.id);
            callback(null);
          });
        },
        (callback) => {
          const params = [
            grading_job.id,
            null, // received_time
            null, // start_time
            null, // finish_tim
            {}, // submitted_answer
            data.format_errors,
            data.gradable,
            data.broken,
            data.params,
            data.true_answer,
            data.feedback,
            data.partial_scores,
            data.score,
            null, // v2_score
          ];
          sqldb.callOneRow('grading_jobs_update_after_grading', params, (err, result) => {
            if (ERR(err, callback)) return;
            grading_job = result.rows[0];
            debug('_createTestSubmission()', 'inserted', 'grading_job.id:', grading_job.id);
            callback(null);
          });
        },
      ],
      (err) => {
        if (ERR(err, callback)) return;
        debug('_createTestSubmission()', 'returning', 'submission_id:', submission_id);
        callback(null, submission_id);
      }
    );
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
      if (!_.isEqual(var1, var2)) {
        courseIssues.push(new Error(`"${name}" mismatch: expected "${json1}" but got "${json2}"`));
      }
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
    checkEqual(
      'format_errors keys',
      Object.keys(expected_submission.format_errors),
      Object.keys(test_submission.format_errors)
    );
    if (!test_submission.gradable || !expected_submission.gradable) {
      return callback(null, courseIssues);
    }
    checkEqual(
      'partial_scores',
      expected_submission.partial_scores,
      test_submission.partial_scores
    );
    checkEqual('score', expected_submission.score, test_submission.score);
    callback(null, courseIssues);
  },

  /**
   * Internal worker for _testQuestion(). Do not call directly.
   * Tests a question variant. Issues will be inserted into the issues table.
   * @protected
   *
   * @param {Object} variant - The variant to submit to.
   * @param {Object} question - The question for the variant.
   * @param {Object} course - The course for the variant.
   * @param {string} test_type - The type of test to run.  Should be one of 'correct', 'incorrect', or 'invalid'.
   * @param {number} authn_user_id - The currently authenticated user.
   * @param {function} callback - A callback(err) function.
   */
  _testVariant(variant, question, course, test_type, authn_user_id, callback) {
    debug('_testVariant()');
    let expected_submission_id, expected_submission, test_submission_id, test_submission;
    async.series(
      [
        (callback) => {
          module.exports._createTestSubmission(
            variant,
            question,
            course,
            test_type,
            authn_user_id,
            (err, ret_submission_id) => {
              if (ERR(err, callback)) return;
              expected_submission_id = ret_submission_id;
              debug('_testVariant()', 'expected_submission_id:', expected_submission_id);
              callback(null);
            }
          );
        },
        (callback) => {
          sqldb.callOneRow('submissions_select', [expected_submission_id], (err, result) => {
            if (ERR(err, callback)) return;
            expected_submission = result.rows[0];
            debug('_testVariant()', 'selected expected_submission, id:', expected_submission.id);
            callback(null);
          });
        },
        (callback) => {
          const submission = {
            variant_id: variant.id,
            auth_user_id: authn_user_id,
            submitted_answer: expected_submission.raw_submitted_answer,
          };
          module.exports.saveSubmission(
            submission,
            variant,
            question,
            course,
            (err, ret_submission_id) => {
              if (ERR(err, callback)) return;
              test_submission_id = ret_submission_id;
              debug('_testVariant()', 'test_submission_id:', test_submission_id);
              callback(null);
            }
          );
        },
        (callback) => {
          module.exports.gradeVariant(
            variant,
            test_submission_id,
            question,
            course,
            authn_user_id,
            true,
            (err) => {
              if (ERR(err, callback)) return;
              debug('testVariant()', 'graded');
              callback(null);
            }
          );
        },
        (callback) => {
          sqldb.callOneRow('submissions_select', [test_submission_id], (err, result) => {
            if (ERR(err, callback)) return;
            test_submission = result.rows[0];
            debug('_testVariant()', 'selected test_submission, id:', test_submission.id);
            callback(null);
          });
        },
        (callback) => {
          module.exports._compareSubmissions(
            expected_submission,
            test_submission,
            (err, courseIssues) => {
              if (ERR(err, callback)) return;
              const studentMessage = 'Question test failure';
              const courseData = {
                variant,
                question,
                course,
                expected_submission,
                test_submission,
              };
              module.exports._writeCourseIssues(
                courseIssues,
                variant,
                authn_user_id,
                studentMessage,
                courseData,
                (err) => {
                  if (ERR(err, callback)) return;
                  callback(null);
                }
              );
            }
          );
        },
      ],
      (err) => {
        if (ERR(err, callback)) return;
        debug('_testVariant()', 'returning');
        callback(null, expected_submission, test_submission);
      }
    );
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

    let variant,
      expected_submission = null,
      test_submission = null;
    async.series(
      [
        (callback) => {
          const instance_question_id = null;
          const course_instance_id = (course_instance && course_instance.id) || null;
          const options = {};
          const require_open = true;
          module.exports.ensureVariant(
            question.id,
            instance_question_id,
            authn_user_id,
            authn_user_id,
            group_work,
            course_instance_id,
            course,
            options,
            require_open,
            (err, ret_variant) => {
              if (ERR(err, callback)) return;
              variant = ret_variant;
              debug('_testQuestion()', 'created variant_id: :', variant.id);
              callback(null);
            }
          );
        },
        (callback) => {
          if (variant.broken) return callback(null);
          module.exports._testVariant(
            variant,
            question,
            course,
            test_type,
            authn_user_id,
            (err, ret_expected_submission, ret_test_submission) => {
              if (ERR(err, callback)) return;
              expected_submission = ret_expected_submission;
              test_submission = ret_test_submission;
              debug(
                '_testQuestion()',
                'tested',
                'expected_submission_id:',
                expected_submission ? expected_submission.id : null,
                'test_submission_id:',
                test_submission ? test_submission.id : null
              );
              callback(null);
            }
          );
        },
      ],
      (err) => {
        if (ERR(err, callback)) return;
        debug('_testQuestion()', 'returning');
        callback(null, variant, expected_submission, test_submission);
      }
    );
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
  _runTest(
    logger,
    showDetails,
    question,
    group_work,
    course_instance,
    course,
    test_type,
    authn_user_id,
    callback
  ) {
    let variant,
      expected_submission,
      test_submission,
      success = true;
    async.series(
      [
        (callback) => {
          logger.verbose('Testing ' + question.qid);
          module.exports._testQuestion(
            question,
            group_work,
            course_instance,
            course,
            test_type,
            authn_user_id,
            (err, ret_variant, ret_expected_submission, ret_test_submission) => {
              if (ERR(err, callback)) return;
              variant = ret_variant;
              expected_submission = ret_expected_submission;
              test_submission = ret_test_submission;
              callback(null);
            }
          );
        },
        (callback) => {
          if (!showDetails) return callback(null);
          const variantKeys = ['broken', 'options', 'params', 'true_answer', 'variant_seed'];
          const submissionKeys = [
            'broken',
            'correct',
            'feedback',
            'format_errors',
            'gradable',
            'grading_method',
            'partial_scores',
            'raw_submitted_answer',
            'score',
            'submitted_answer',
            'true_answer',
          ];
          logger.verbose(
            'variant:\n' + jsonStringifySafe(_.pick(variant, variantKeys), null, '    ')
          );
          if (_.isObject(expected_submission)) {
            logger.verbose(
              'expected_submission:\n' +
                jsonStringifySafe(_.pick(expected_submission, submissionKeys), null, '    ')
            );
          }
          if (_.isObject(test_submission)) {
            logger.verbose(
              'test_submission:\n' +
                jsonStringifySafe(_.pick(test_submission, submissionKeys), null, '    ')
            );
          }
          callback(null);
        },
        (callback) => {
          sqldb.query(sql.select_issues_for_variant, { variant_id: variant.id }, (err, result) => {
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
      ],
      (err) => {
        if (ERR(err, callback)) return;
        callback(null, success);
      }
    );
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
  startTestQuestion(
    count,
    showDetails,
    question,
    group_work,
    course_instance,
    course,
    authn_user_id,
    callback
  ) {
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

        async.eachSeries(
          _.range(count * test_types.length),
          (iter, callback) => {
            let type = test_types[iter % test_types.length];
            job.verbose(`Test ${Math.floor(iter / test_types.length) + 1}, type ${type}`);
            module.exports._runTest(
              job,
              showDetails,
              question,
              group_work,
              course_instance,
              course,
              type,
              authn_user_id,
              (err, ret_success) => {
                if (ERR(err, callback)) return;
                success = success && ret_success;
                callback(null);
              }
            );
          },
          (err) => {
            if (ERR(err, () => {})) return job.fail(err);
            if (!success) return job.fail('Some tests failed. See the "Errors" page for details.');
            job.succeed();
          }
        );
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
  _render(
    renderSelection,
    variant,
    question,
    submission,
    submissions,
    course,
    course_instance,
    locals,
    callback
  ) {
    questionServers.getModule(question.type, (err, questionModule) => {
      if (ERR(err, callback)) return;
      questionModule.render(
        renderSelection,
        variant,
        question,
        submission,
        submissions,
        course,
        course_instance,
        locals,
        (err, courseIssues, htmls) => {
          if (ERR(err, callback)) return;

          const studentMessage = 'Error rendering question';
          const courseData = { variant, question, submission, course };
          // locals.authn_user may not be populated when rendering a panel
          const user_id = locals && locals.authn_user ? locals.authn_user.user_id : null;
          module.exports._writeCourseIssues(
            courseIssues,
            variant,
            user_id,
            studentMessage,
            courseData,
            (err) => {
              if (ERR(err, callback)) return;
              return callback(null, htmls);
            }
          );
        }
      );
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
      urls.reloadUrl = questionUrl + 'preview/' + '?variant_id=' + variant.id;
      urls.clientFilesQuestionUrl = questionUrl + 'clientFilesQuestion';

      // necessary for backward compatibility
      urls.calculationQuestionFileUrl = questionUrl + 'file';

      // FIXME: broken?
      urls.calculationQuestionGeneratedFileUrl = questionUrl + 'generatedFilesQuestion';

      urls.clientFilesCourseUrl = urlPrefix + '/clientFilesCourse';
      urls.clientFilesQuestionGeneratedFileUrl =
        questionUrl + 'generatedFilesQuestion/variant/' + variant.id;
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
      urls.calculationQuestionGeneratedFileUrl =
        iqUrl + 'generatedFilesQuestion/variant/' + variant.id;

      urls.clientFilesCourseUrl = urlPrefix + '/clientFilesCourse';
      urls.clientFilesQuestionGeneratedFileUrl =
        iqUrl + 'generatedFilesQuestion/variant/' + variant.id;
      urls.baseUrl = urlPrefix;
    }

    if (variant.workspace_id) {
      urls.workspaceUrl = `/pl/workspace/${variant.workspace_id}`;
    }

    return urls;
  },

  _buildLocals(
    variant,
    question,
    instance_question,
    assessment,
    assessment_instance,
    assessment_question,
    authz_result
  ) {
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
      if (assessment.type === 'Homework') {
        locals.showGradeButton = true;
        locals.showSaveButton = true;
        locals.allowAnswerEditing = true;
        if (!question.single_variant) {
          locals.hasAttemptsOtherVariants = true;
          locals.variantAttemptsLeft = assessment_question.tries_per_variant - variant.num_tries;
          locals.variantAttemptsTotal = assessment_question.tries_per_variant;
        }
      }
      if (assessment.type === 'Exam') {
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
    if (
      !variant.open ||
      (instance_question && !instance_question.open) ||
      (assessment_instance && !assessment_instance.open)
    ) {
      locals.showGradeButton = false;
      locals.showSaveButton = false;
      locals.allowAnswerEditing = false;
      if (assessment && assessment.type === 'Homework') {
        locals.showTryAgainButton = true;
        locals.showTrueAnswer = true;
      }
    }

    // Used for "auth" for external grading realtime results
    // ID is coerced to a string so that it matches what we get back from the client
    locals.variantToken = csrf.generateToken({ variantId: '' + variant.id }, config.secretKey);

    if (variant.broken) {
      locals.showGradeButton = false;
      locals.showSaveButton = false;
      locals.showTryAgainButton = true;
    }

    if (question && question.grading_method === 'Manual') {
      locals.showGradeButton = false;
      locals.showManualGradingMsg = true;
    }

    if (authz_result && !authz_result.active) {
      locals.showGradeButton = false;
      locals.showSaveButton = false;
      locals.showNewVariantButton = false;
      locals.allowAnswerEditing = false;
      locals.showTryAgainButton = false;
      locals.hasAttemptsOtherVariants = false;
      locals.showTrueAnswer = true;
    }

    // Manually disable correct answer panel
    if (question && question.hide_correct_answer) {
      locals.showTrueAnswer = false;
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
    async.series(
      [
        (callback) => {
          if (variant_id != null) {
            const params = [variant_id, locals.question.id, locals.instance_question?.id];
            sqldb.callOneRow('variants_select', params, (err, result) => {
              if (ERR(err, callback)) return;
              debug('variants_select', result.rows[0].variant);
              _.assign(locals, result.rows[0]);
              callback(null);
            });
          } else {
            const require_open = locals.assessment && locals.assessment.type !== 'Exam';
            const instance_question_id = locals.instance_question
              ? locals.instance_question.id
              : null;
            const course_instance_id =
              locals.course_instance_id ||
              (locals.course_instance && locals.course_instance.id) ||
              null;
            const options = {
              variant_seed,
            };
            const assessmentGroupWork = locals.assessment ? locals.assessment.group_work : false;
            module.exports.ensureVariant(
              locals.question.id,
              instance_question_id,
              locals.user.user_id,
              locals.authn_user.user_id,
              assessmentGroupWork,
              course_instance_id,
              locals.course,
              options,
              require_open,
              (err, variant) => {
                if (ERR(err, callback)) return;
                locals.variant = variant;
                callback(null);
              }
            );
          }
        },
        (callback) => {
          const { urlPrefix, variant, question, instance_question, assessment } = locals;

          const urls = module.exports._buildQuestionUrls(
            urlPrefix,
            variant,
            question,
            instance_question,
            assessment
          );
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
            authz_result,
          } = locals;

          const newLocals = module.exports._buildLocals(
            variant,
            question,
            instance_question,
            assessment,
            assessment_instance,
            assessment_question,
            authz_result
          );
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
              const renderer = new showdown.Converter({
                literalMidWordUnderscores: true,
                literalMidWordAsterisks: true,
              });

              locals.submissions = result.rows.map((s, idx) => ({
                grading_job_stats: module.exports._buildGradingJobStats(s.grading_job),
                submission_number: result.rowCount - idx,
                feedback_manual_html: renderer.makeHtml(s.feedback?.manual?.toString() || ''),
                ...s,
              }));
              locals.submission = locals.submissions[0]; // most recent submission

              locals.showSubmissions = true;
              if (!locals.assessment && !locals.question.hide_correct_answer) {
                // instructor question pages, only show if true answer is
                // allowed by this question
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
            header: true,
            question: true,
            submissions: locals.showSubmissions,
            answer: locals.showTrueAnswer,
          };
          module.exports._render(
            renderSelection,
            locals.variant,
            locals.question,
            locals.submission,
            locals.submissions,
            locals.course,
            locals.course_instance,
            locals,
            (err, htmls) => {
              if (ERR(err, callback)) return;
              locals.extraHeadersHtml = htmls.extraHeadersHtml;
              locals.questionHtml = htmls.questionHtml;
              locals.submissionHtmls = htmls.submissionHtmls;
              locals.answerHtml = htmls.answerHtml;
              callback(null);
            }
          );
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
            submittedAnswer:
              locals.showSubmissions && locals.submission
                ? locals.submission.submitted_answer
                : null,
            feedback: locals.showFeedback && locals.submission ? locals.submission.feedback : null,
            trueAnswer: locals.showTrueAnswer ? locals.variant.true_answer : null,
            submissions: locals.showSubmissions ? locals.submissions : null,
          });
          var encodedJson = encodeURIComponent(questionJson);
          locals.questionJsonBase64 = Buffer.from(encodedJson).toString('base64');
          locals.video = null;
          locals.iqqrcode = new QR({
            content: `${config.PLpeekUrl}/${locals.variant.instance_question_id}`,
          }).svg();
          callback(null);
        },
      ],
      (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      }
    );
  },

  _buildGradingJobStats(job) {
    if (job) {
      const phases = [];
      const totalDuration = moment
        .duration(moment(job.grading_requested_at).diff(job.graded_at))
        .asMilliseconds();
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
  renderPanelsForSubmission(
    submission_id,
    urlPrefix,
    questionContext,
    csrfToken,
    authorizedEdit,
    callback
  ) {
    const params = {
      submission_id,
    };
    sqldb.queryOneRow(sql.select_submission_info, params, (err, results) => {
      if (ERR(err, callback)) return;

      const renderSelection = {
        submissions: true,
      };
      const {
        variant,
        submission,
        instance_question,
        next_instance_question,
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
      _.assign(
        locals,
        module.exports._buildQuestionUrls(
          urlPrefix,
          variant,
          question,
          instance_question,
          assessment
        )
      );
      _.assign(
        locals,
        module.exports._buildLocals(
          variant,
          question,
          instance_question,
          assessment,
          assessment_instance,
          assessment_question
        )
      );

      async.parallel(
        [
          (callback) => {
            // Render the submission panel
            submission.submission_number = submission_index;
            const submissions = [submission];

            module.exports._render(
              renderSelection,
              variant,
              question,
              submission,
              submissions,
              course,
              course_instance,
              locals,
              (err, htmls) => {
                if (ERR(err, callback)) return;
                submission.grading_job_id = grading_job_id;
                submission.grading_job_status = grading_job_status;
                submission.formatted_date = formatted_date;
                submission.grading_job_stats = module.exports._buildGradingJobStats(grading_job);

                const renderParams = {
                  course,
                  course_instance,
                  question,
                  submission,
                  submissionHtml: htmls.submissionHtmls[0],
                  submissionCount: submission_count,
                  urlPrefix,
                  plainUrlPrefix: config.urlPrefix,
                };
                const templatePath = path.join(
                  __dirname,
                  '..',
                  'pages',
                  'partials',
                  'submission.ejs'
                );
                ejs.renderFile(templatePath, renderParams, (err, html) => {
                  if (ERR(err, callback)) return;
                  panels.submissionPanel = html;
                  callback(null);
                });
              }
            );
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
              authz_result: { authorized_edit: authorizedEdit },
            };
            const templatePath = path.join(
              __dirname,
              '..',
              'pages',
              'partials',
              'questionScorePanel.ejs'
            );
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

            const templatePath = path.join(
              __dirname,
              '..',
              'pages',
              'partials',
              'assessmentScorePanel.ejs'
            );
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
              authz_result: { authorized_edit: authorizedEdit },
            };
            _.assign(renderParams, locals);

            const templatePath = path.join(
              __dirname,
              '..',
              'pages',
              'partials',
              'questionFooter.ejs'
            );
            ejs.renderFile(templatePath, renderParams, (err, html) => {
              if (ERR(err, callback)) return;
              panels.questionPanelFooter = html;
              callback(null);
            });
          },
          (callback) => {
            // only render if variant is part of assessment
            if (variant.instance_question_id == null) {
              return callback(null);
            }

            // Render the next question nav link
            // NOTE: This must be kept in sync with the corresponding code in
            // `pages/partials/questionNavSideButtonGroup.ejs`.
            const renderParams = {
              question: next_instance_question,
              advance_score_perc: assessment_question.advance_score_perc,
              button: {
                id: 'question-nav-next',
                label: 'Next question',
              },
            };
            _.assign(renderParams, locals);
            renderParams.urlPrefix = urlPrefix; // needed to get urlPrefix for the course instance, not the site

            const templatePath = path.join(
              __dirname,
              '..',
              'pages',
              'partials',
              'questionNavSideButton.ejs'
            );
            ejs.renderFile(templatePath, renderParams, (err, html) => {
              if (ERR(err, callback)) return;
              panels.questionNavNextButton = html;
              callback(null);
            });
          },
        ],
        (err) => {
          if (ERR(err, callback)) return;
          callback(null, panels);
        }
      );
    });
  },
};
