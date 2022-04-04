const ERR = require('async-stacktrace');
const _ = require('lodash');
const async = require('async');
const ejs = require('ejs');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const error = require('../prairielib/lib/error');
const logger = require('../lib/logger');
const question = require('../lib/question');
const externalGrader = require('./externalGrader');
const externalGradingSocket = require('../lib/externalGradingSocket');
const serverJobs = require('../lib/server-jobs');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
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
      if (result.rowCount !== 1) return callback(new Error('access denied'));
      callback(null);
    });
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
   * @param {boolean} group_work - If the assessment will support group work.
   * @param {number} authn_user_id - The current authenticated user.
   * @param {string} mode - The mode for the new assessment instance.
   * @param {?number} time_limit_min - The time limit for the new assessment instance.
   * @param {Date} date - The date of creation for the new assessment instance.
   * @param {function} callback - A callback(err, assessment_instance_id) function.
   */
  makeAssessmentInstance(
    assessment_id,
    user_id,
    group_work,
    authn_user_id,
    mode,
    time_limit_min,
    date,
    callback
  ) {
    var params = [assessment_id, user_id, group_work, authn_user_id, mode, time_limit_min, date];
    sqldb.callOneRow('assessment_instances_insert', params, (err, result) => {
      if (ERR(err, callback)) return;
      const assessment_instance_id = result.rows[0].assessment_instance_id;
      callback(null, assessment_instance_id);
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
    async.series(
      [
        (callback) => {
          sqldb.runInTransaction(
            (client, callback) => {
              debug('inside transaction');
              async.series(
                [
                  (callback) => {
                    sqldb.callWithClient(
                      client,
                      'assessment_instances_lock',
                      [assessment_instance_id],
                      (err) => {
                        if (ERR(err, callback)) return;
                        debug('locked');
                        callback(null);
                      }
                    );
                  },
                  (callback) => {
                    const params = [assessment_instance_id, authn_user_id];
                    sqldb.callWithClientOneRow(
                      client,
                      'assessment_instances_update',
                      params,
                      (err, result) => {
                        if (ERR(err, callback)) return;
                        updated = result.rows[0].updated;
                        debug('updated:', updated);
                        callback(null);
                      }
                    );
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
                    sqldb.callWithClientOneRow(
                      client,
                      'assessment_instances_grade',
                      params,
                      (err, _result) => {
                        if (ERR(err, callback)) return;
                        debug('graded');
                        callback(null);
                      }
                    );
                  },
                ],
                (err) => {
                  if (ERR(err, callback)) return;
                  callback(null);
                }
              );
            },
            (err) => {
              if (ERR(err, callback)) return;
              debug('transaction ended');
              callback(null);
            }
          );
        },
        (callback) => {
          // Don't try to update LIT score if the assessment wasn't updated.
          if (!updated) return callback(null);

          // NOTE: It's important that this is run outside of `runInTransaction`
          // above. This will hit the network, and as a rule we don't do any
          // potentially long-running work inside of a transaction.
          ltiOutcomes.updateScore(assessment_instance_id, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          });
        },
      ],
      (err) => {
        if (ERR(err, callback)) return;
        callback(null, updated);
      }
    );
  },

  /**
   * Grade all questions in an assessment instance and (optionally) close it.
   *
   * All user-facing routes should set `requireOpen` to true. However, internal
   * functions that asynchronously grade exams can set `requireOpen` to false
   * if needed.
   *
   * @param {number} assessment_instance_id - The assessment instance to grade.
   * @param {number} authn_user_id - The current authenticated user.
   * @param {boolean} requireOpen - Whether to enforce that the assessment instance is open before grading.
   * @param {boolean} close - Whether to close the assessment instance after grading.
   * @param {boolean} overrideGradeRate - Whether to override grade rate limits.
   * @param {function} callback - A callback(err) function.
   */
  gradeAssessmentInstance(
    assessment_instance_id,
    authn_user_id,
    requireOpen,
    close,
    overrideGradeRate,
    callback
  ) {
    debug('gradeAssessmentInstance()');
    let rows;
    overrideGradeRate = close || overrideGradeRate;

    // We may have to submit grading jobs to the external grader after this
    // grading transaction has been accepted; collect those job ids here.
    let externalGradingJobIds = [];

    async.series(
      [
        async () => {
          if (requireOpen) {
            await sqldb.callAsync('assessment_instances_ensure_open', [assessment_instance_id]);
          }

          if (close) {
            // If we're supposed to close the assessment, do it *before* we
            // we start grading. This avoids a race condition where the student
            // makes an additional submission while grading is already in progress.
            await sqldb.callAsync('assessment_instances_close', [
              assessment_instance_id,
              authn_user_id,
            ]);
          }
        },
        (callback) => {
          sqldb.call(
            'variants_select_for_assessment_instance_grading',
            [assessment_instance_id],
            (err, result) => {
              if (ERR(err, callback)) return;
              rows = result.rows;
              debug('gradeAssessmentInstance()', 'selected variants', 'count:', rows.length);
              callback(null);
            }
          );
        },
        (callback) => {
          async.eachSeries(
            rows,
            (row, callback) => {
              debug('gradeAssessmentInstance()', 'loop', 'variant.id:', row.variant.id);
              const check_submission_id = null;
              question.gradeVariant(
                row.variant,
                check_submission_id,
                row.question,
                row.course,
                authn_user_id,
                overrideGradeRate,
                (err, gradingJobId) => {
                  if (ERR(err, callback)) return;
                  if (gradingJobId !== undefined) {
                    externalGradingJobIds.push(gradingJobId);
                  }
                  callback(null);
                }
              );
            },
            (err) => {
              if (ERR(err, callback)) return;
              debug('gradeAssessmentInstance()', 'finished grading');
              callback(null);
            }
          );
        },
        (callback) => {
          if (externalGradingJobIds.length > 0) {
            // We need to submit these grading jobs to be graded
            externalGrader.beginGradingJobs(externalGradingJobIds, (err) => {
              if (ERR(err, callback)) return;
              callback(null);
            });
          } else {
            callback(null);
          }
        },
        async () => {
          // The `grading_needed` flag was set by the `assessment_instances_close`
          // sproc above. Once we've successfully graded every part of the
          // assessment instance, set the flag to false so that we don't try to
          // grade it again in the future.
          //
          // This flag exists only to handle the case where we close the exam
          // but then the PrairieLearn server crashes before we can grade it.
          // In that case, the `autoFinishExams` cronjob will detect that the
          // assessment instance hasn't been fully graded and will grade any
          // ungraded portions of it.
          //
          // There's a potential race condition here where the `autoFinishExams`
          // cronjob runs after `assessment_instances_close` but before the above
          // calls to `gradeVariant` have finished. In that case, we'll
          // concurrently try to grade the same variant twice. This shouldn't
          // impact correctness, as `gradeVariant` is resiliant to being run
          // multiple times concurrently. The only bad thing that will happen
          // is that we'll have wasted some work, but that's acceptable.
          await sqldb.queryAsync(sql.unset_grading_needed, { assessment_instance_id });
        },
      ],
      (err) => {
        if (ERR(err, callback)) return;
        debug('gradeAssessmentInstance()', 'success');
        callback(null);
      }
    );
  },

  /**
   * Grade all assessment instances and (optionally) close them.
   *
   * @param {number} assessment_id - The assessment to grade.
   * @param {number} user_id - The current user performing the update.
   * @param {number} authn_user_id - The current authenticated user.
   * @param {boolean} close - Whether to close the assessment instances after grading.
   * @param {boolean} overrideGradeRate - Whether to override grade rate limits.
   * @param {function} callback - A callback(err) function.
   */
  gradeAllAssessmentInstances(
    assessment_id,
    user_id,
    authn_user_id,
    close,
    overrideGradeRate,
    callback
  ) {
    debug('gradeAllAssessmentInstances()');
    const params = { assessment_id };
    sqldb.queryOneRow(sql.select_assessment_info, params, function (err, result) {
      if (ERR(err, callback)) return;
      const assessment_label = result.rows[0].assessment_label;
      const course_instance_id = result.rows[0].course_instance_id;
      const course_id = result.rows[0].course_id;

      const options = {
        course_id: course_id,
        course_instance_id: course_instance_id,
        assessment_id: assessment_id,
        user_id: user_id,
        authn_user_id: authn_user_id,
        type: 'grade_all_assessment_instances',
        description: 'Grade all assessment instances for ' + assessment_label,
      };
      serverJobs.createJobSequence(options, function (err, job_sequence_id) {
        if (ERR(err, callback)) return;
        callback(null, job_sequence_id);

        // We've now triggered the callback to our caller, but we
        // continue executing below to launch the jobs themselves.

        const jobOptions = {
          course_id: course_id,
          course_instance_id: course_instance_id,
          assessment_id: assessment_id,
          user_id: user_id,
          authn_user_id: authn_user_id,
          type: 'grade_all_assessment_instances',
          description: 'Grade all assessment instances for ' + assessment_label,
          job_sequence_id: job_sequence_id,
          last_in_sequence: true,
        };
        serverJobs.createJob(jobOptions, function (err, job) {
          if (err) {
            logger.error('Error in createJob()', err);
            serverJobs.failJobSequence(job_sequence_id);
            return;
          }
          job.verbose('Grading assessment instances for ' + assessment_label);

          const params = { assessment_id };
          sqldb.query(sql.select_instances_to_grade, params, (err, result) => {
            if (ERR(err, callback)) return;
            let rows = result.rows;
            job.verbose(
              rows.length === 1 ? 'One instance found' : rows.length + ' instances found'
            );
            async.eachSeries(
              rows,
              (row, callback) => {
                job.verbose(
                  `Grading assessment instance #${row.instance_number} for ${row.username}`
                );
                const requireOpen = true;
                module.exports.gradeAssessmentInstance(
                  row.assessment_instance_id,
                  authn_user_id,
                  requireOpen,
                  close,
                  overrideGradeRate,
                  (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                  }
                );
              },
              (err) => {
                if (err) {
                  job.fail(error.newMessage(err, 'Error grading instances'));
                } else {
                  job.verbose('Finished grading assessment instances');
                  job.succeed();
                }
              }
            );
          });
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
    async.series(
      [
        (callback) => {
          if (!_(content.grading).isObject()) {
            return callback(error.makeWithData('invalid grading', { content: content }));
          }
          if (_(content.grading).has('feedback') && !_(content.grading.feedback).isObject()) {
            return callback(
              error.makeWithData('invalid grading.feedback', {
                content: content,
              })
            );
          }

          const succeeded = !!_.get(content, 'grading.feedback.results.succeeded', true);
          const gradable = !!_.get(content, 'grading.feedback.results.gradable', true);
          if (!succeeded) {
            content.grading.score = 0;
          }

          if (gradable) {
            /* We only care about the score if it is gradable */
            if (!_(content.grading.score).isNumber()) {
              return callback(
                error.makeWithData('invalid grading.score', {
                  content: content,
                })
              );
            }
            if (content.grading.score < 0 || content.grading.score > 1) {
              return callback(
                error.makeWithData('grading.score out of range', {
                  content: content,
                })
              );
            }
          }

          const params = [
            content.gradingId,
            content.grading.receivedTime,
            content.grading.startTime,
            content.grading.endTime,
            null, // `submitted_answer`
            content.grading.format_errors,
            gradable,
            false, // `broken`
            null, // `params`
            null, // `true_answer`
            content.grading.feedback,
            {}, // `partial_scores`
            content.grading.score,
            null, // `v2_score`: gross legacy, this can safely be null
          ];
          sqldb.call('grading_jobs_update_after_grading', params, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          });
        },
        (callback) => {
          sqldb.queryOneRow(
            sql.select_assessment_for_grading_job,
            { grading_job_id: content.gradingId },
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
        if (ERR(err, () => {})) {
          // FIXME: call sprocs/errors_insert here
          logger.error('processGradingResult: error', {
            message: err.message,
            stack: err.stack,
            data: JSON.stringify(err.data),
          });
        }
        externalGradingSocket.gradingJobStatusUpdated(content.gradingId);
      }
    );
  },
};
