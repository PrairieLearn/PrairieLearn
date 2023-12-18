// @ts-check

const ERR = require('async-stacktrace');
const _ = require('lodash');
import * as async from 'async';
import * as util from 'util';
import * as fs from 'fs';
import * as unzipper from 'unzipper';

import * as externalGrader from './externalGrader';
import * as ltiOutcomes from './ltiOutcomes';
import { writeCourseIssues } from './issues';
import { getQuestionCourse } from './question-variant';
import * as sqldb from '@prairielearn/postgres';
import * as questionServers from '../question-servers';
import * as workspaceHelper from './workspace';

const sql = sqldb.loadSqlEquiv(__filename);

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
 * Save a new submission to a variant into the database.
 *
 * @param {Object} submission - The submission to save (should not have an id property yet).
 * @param {Object} variant - The variant to submit to.
 * @param {Object} question - The question for the variant.
 * @param {Object} variant_course - The course for the variant.
 * @param {function} callback - A callback(err, submission_id) function.
 */
export function saveSubmission(submission, variant, question, variant_course, callback) {
  submission.raw_submitted_answer = submission.submitted_answer;
  submission.gradable = true;
  /** @type {questionServers.QuestionServer} */
  let questionModule;
  let question_course, courseIssues, data, submission_id, workspace_id, zipPath;
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
            if (result.rowCount != null && result.rowCount > 0) {
              workspace_id = result.rows[0].workspace_id;
            }
            callback(null);
          });
        } else {
          callback(null);
        }
      },
      async () => {
        // if we have a workspace and any files to be graded, get the files
        if (workspace_id == null || !question.workspace_graded_files?.length) {
          return;
        }
        try {
          zipPath = await workspaceHelper.getGradedFiles(workspace_id);
        } catch (err) {
          if (err instanceof workspaceHelper.SubmissionFormatError) {
            ((submission.format_errors ??= {})._files ??= []).push(err.message);
          } else {
            throw err;
          }
        }
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
      async () => {
        questionModule = questionServers.getModule(question.type);
        question_course = await getQuestionCourse(question, variant_course);
        ({ courseIssues, data } = await questionModule.parse(
          submission,
          variant,
          question,
          question_course,
        ));

        const studentMessage = 'Error parsing submission';
        const courseData = { variant, question, submission, course: variant_course };
        await writeCourseIssues(
          courseIssues,
          variant,
          submission.auth_user_id,
          studentMessage,
          courseData,
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
          data.feedback,
          false, // regradable
          submission.credit,
          submission.mode,
          submission.variant_id,
          submission.auth_user_id,
          submission.client_fingerprint_id,
        ];
        sqldb.callOneRow('submissions_insert', params, (err, result) => {
          if (ERR(err, callback)) return;
          submission_id = result.rows[0].submission_id;
          callback(null);
        });
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null, submission_id);
    },
  );
}

/**
 * Grade the most recent submission for a given variant.
 *
 * @param {Object} variant - The variant to grade.
 * @param {string | null} check_submission_id - The submission_id that must be graded (or null to skip this check).
 * @param {Object} question - The question for the variant.
 * @param {Object} variant_course - The course for the variant.
 * @param {string | null} authn_user_id - The currently authenticated user.
 * @param {boolean} overrideGradeRateCheck - Whether to override grade rate limits.
 * @param {function} callback - A callback(err) function.
 */
export function gradeVariant(
  variant,
  check_submission_id,
  question,
  variant_course,
  authn_user_id,
  overrideGradeRateCheck,
  callback,
) {
  /** @type {questionServers.QuestionServer} */
  let questionModule;
  let question_course, courseIssues, data, submission, grading_job;
  async.series(
    [
      async () => {
        question_course = await getQuestionCourse(question, variant_course);
      },
      (callback) => {
        var params = [variant.id, check_submission_id];
        sqldb.callZeroOrOneRow('variants_select_submission_for_grading', params, (err, result) => {
          if (ERR(err, callback)) return;
          if (result.rowCount === 0) return callback(new NoSubmissionError());
          submission = result.rows[0];
          callback(null);
        });
      },
      (callback) => {
        if (overrideGradeRateCheck) return callback(null);
        var params = [variant.instance_question_id];
        sqldb.callZeroOrOneRow('instance_questions_next_allowed_grade', params, (err, result) => {
          if (ERR(err, callback)) return;
          if (result.rows[0].allow_grade_left_ms > 0) return callback(new NoSubmissionError());
          callback(null);
        });
      },
      (callback) => {
        const params = [submission.id, authn_user_id];
        sqldb.callOneRow('grading_jobs_insert', params, (err, result) => {
          if (ERR(err, callback)) return;

          grading_job = result.rows[0];
          callback(null);
        });
      },
      async () => {
        questionModule = questionServers.getModule(question.type);

        if (question.grading_method !== 'External') {
          // For Internal grading we call the grading code. For Manual grading, if the question
          // reached this point, it has auto points, so it should be treated like Internal.
          ({ courseIssues, data } = await questionModule.grade(
            submission,
            variant,
            question,
            question_course,
          ));
          const hasFatalIssue = _.some(_.map(courseIssues, 'fatal'));
          data = {
            ...data,
            gradable: data.gradable && !hasFatalIssue,
            broken: hasFatalIssue,
          };
        } else {
          // for External grading we don't do anything
          courseIssues = [];
          data = {};
        }

        const studentMessage = 'Error grading submission';
        const courseData = { variant, question, submission, course: variant_course };
        await writeCourseIssues(
          courseIssues,
          variant,
          submission.auth_user_id,
          studentMessage,
          courseData,
        );
      },
      (callback) => {
        if (question.grading_method === 'External') {
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
          },
        );
      },
    ],
    (err) => {
      // catch NoSubmissionError as we are just using it to exit with no action
      if (err instanceof NoSubmissionError) {
        err = null;
      }
      if (ERR(err, callback)) return;
      // data and grading_job might not be defined if we bailed out early above
      if (data && !data.broken && grading_job && grading_job.grading_method === 'External') {
        // We need to submit this external grading job.
        util.callbackify(externalGrader.beginGradingJob)(grading_job.id, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      } else {
        callback(null);
      }
    },
  );
}

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
export function saveAndGradeSubmission(
  submission,
  variant,
  question,
  course,
  overrideGradeRateCheck,
  callback,
) {
  let submission_id, grading_job_id;
  async.series(
    [
      (callback) => {
        saveSubmission(submission, variant, question, course, (err, ret_submission_id) => {
          if (ERR(err, callback)) return;
          submission_id = ret_submission_id;
          callback(null);
        });
      },
      (callback) => {
        gradeVariant(
          variant,
          submission_id,
          question,
          course,
          submission.auth_user_id,
          overrideGradeRateCheck,
          (err, ret_grading_job_id) => {
            if (ERR(err, callback)) return;
            grading_job_id = ret_grading_job_id;
            callback(null);
          },
        );
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      if (grading_job_id !== undefined) {
        // We need to submit this grading job now that the
        // transaction has been committed
        util.callbackify(externalGrader.beginGradingJob)(grading_job_id, (err) => {
          if (ERR(err, callback)) return;
          callback(null, submission_id);
        });
      } else {
        // We're done!
        callback(null, submission_id);
      }
    },
  );
}
