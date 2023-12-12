// @ts-check

const ERR = require('async-stacktrace');
const _ = require('lodash');
import * as async from 'async';
const jsonStringifySafe = require('json-stringify-safe');
import debugfn from 'debug';
import * as path from 'path';
const assert = require('node:assert');

import * as sqldb from '@prairielearn/postgres';
import * as questionServers from '../question-servers';
import { createServerJob } from './server-jobs';
import { saveSubmission, gradeVariant } from './grading';
import { getQuestionCourse, ensureVariant } from './question-variant';
import { getAndRenderVariant } from './question-render';
import { writeCourseIssues } from './issues';
import { SubmissionSchema } from './db-types';

const debug = debugfn('prairielearn:' + path.basename(__filename, '.js'));
const sql = sqldb.loadSqlEquiv(__filename);

/**
 * Internal worker for testVariant(). Do not call directly.
 * @protected
 *
 * @param {Object} variant - The variant to submit to.
 * @param {Object} question - The question for the variant.
 * @param {Object} variant_course - The course for the variant.
 * @param {'correct' | 'incorrect' | 'invalid'} test_type - The type of test to run.
 * @param {string} authn_user_id - The currently authenticated user.
 * @param {function} callback - A callback(err, submission_id) function.
 */
function createTestSubmission(
  variant,
  question,
  variant_course,
  test_type,
  authn_user_id,
  callback,
) {
  debug('_createTestSubmission()');
  if (question.type !== 'Freeform') return callback(new Error('question.type must be Freeform'));
  const questionModule = questionServers.getModule(question.type);
  let question_course, courseIssues, data, submission_id, grading_job;
  async.series(
    [
      async () => {
        question_course = await getQuestionCourse(question, variant_course);
      },
      (callback) => {
        assert(questionModule.test, `Question type ${question.type} does not support testing.`);
        questionModule.test(
          variant,
          question,
          question_course,
          test_type,
          (err, ret_courseIssues, ret_data) => {
            if (ERR(err, callback)) return;
            courseIssues = ret_courseIssues;
            data = ret_data;
            const hasFatalIssue = _.some(_.map(courseIssues, 'fatal'));
            data.broken = hasFatalIssue;
            debug('_createTestSubmission()', 'completed test()');
            callback(null);
          },
        );
      },
      (callback) => {
        const studentMessage = 'Error creating test submission';
        const courseData = { variant, question, course: variant_course };
        writeCourseIssues(
          courseIssues,
          variant,
          authn_user_id,
          studentMessage,
          courseData,
          (err) => {
            if (ERR(err, callback)) return;
            debug('_createTestSubmission()', `wrote courseIssues: ${courseIssues.length}`);
            callback(null);
          },
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
          null, // feedback
          true, // regradable
          null, // credit
          null, // mode
          variant.id,
          authn_user_id,
          null, // client_fingerprint_id
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
    },
  );
}

/**
 * Internal worker for testVariant(). Do not call directly.
 * @protected
 *
 * @param {Object} expected_submission - Generated reference submission data.
 * @param {Object} test_submission - Computed submission to be tested.
 * @param {function} callback - A callback(err, courseIssues) function.
 */
function compareSubmissions(expected_submission, test_submission, callback) {
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
    Object.keys(test_submission.format_errors),
  );
  if (!test_submission.gradable || !expected_submission.gradable) {
    return callback(null, courseIssues);
  }
  checkEqual('partial_scores', expected_submission.partial_scores, test_submission.partial_scores);
  checkEqual('score', expected_submission.score, test_submission.score);
  callback(null, courseIssues);
}

/**
 * Internal worker for _testQuestion(). Do not call directly.
 * Tests a question variant. Issues will be inserted into the issues table.
 * @protected
 *
 * @param {Object} variant - The variant to submit to.
 * @param {Object} question - The question for the variant.
 * @param {Object} course - The course for the variant.
 * @param {'correct' | 'incorrect' | 'invalid'} test_type - The type of test to run.
 * @param {string} authn_user_id - The currently authenticated user.
 * @param {function} callback - A callback(err) function.
 */
function testVariant(variant, question, course, test_type, authn_user_id, callback) {
  debug('_testVariant()');
  let expected_submission_id, expected_submission, test_submission_id, test_submission;
  async.series(
    [
      (callback) => {
        createTestSubmission(
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
          },
        );
      },
      async () => {
        expected_submission = await selectSubmission(expected_submission_id);
        debug('_testVariant()', 'selected expected_submission, id:', expected_submission.id);
      },
      (callback) => {
        const submission = {
          variant_id: variant.id,
          auth_user_id: authn_user_id,
          submitted_answer: expected_submission.raw_submitted_answer,
        };
        saveSubmission(submission, variant, question, course, (err, ret_submission_id) => {
          if (ERR(err, callback)) return;
          test_submission_id = ret_submission_id;
          debug('_testVariant()', 'test_submission_id:', test_submission_id);
          callback(null);
        });
      },
      (callback) => {
        gradeVariant(variant, test_submission_id, question, course, authn_user_id, true, (err) => {
          if (ERR(err, callback)) return;
          debug('testVariant()', 'graded');
          callback(null);
        });
      },
      async () => {
        test_submission = await selectSubmission(test_submission_id);
        debug('_testVariant()', 'selected test_submission, id:', test_submission.id);
      },
      (callback) => {
        compareSubmissions(expected_submission, test_submission, (err, courseIssues) => {
          if (ERR(err, callback)) return;
          const studentMessage = 'Question test failure';
          const courseData = {
            variant,
            question,
            course,
            expected_submission,
            test_submission,
          };
          writeCourseIssues(
            courseIssues,
            variant,
            authn_user_id,
            studentMessage,
            courseData,
            (err) => {
              if (ERR(err, callback)) return;
              callback(null);
            },
          );
        });
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      debug('_testVariant()', 'returning');
      callback(null, expected_submission, test_submission);
    },
  );
}

/**
 * Test a question. Issues will be inserted into the issues table.
 *
 * @param {Object} question - The question for the variant.
 * @param {boolean} group_work - If the assessment will support group work.
 * @param {Object} variant_course - The course for the variant.
 * @param {string} authn_user_id - The currently authenticated user.
 * @param {'correct' | 'incorrect' | 'invalid'} test_type - The type of test to run.
 * @param {function} callback - A callback(err, variant) function.
 */
function testQuestion(
  question,
  group_work,
  course_instance,
  variant_course,
  test_type,
  authn_user_id,
  callback,
) {
  debug('_testQuestion()');

  let generateDuration;
  let renderDuration;
  let gradeDuration;

  let variant,
    question_course,
    expected_submission = null,
    test_submission = null;
  async.series(
    [
      async () => {
        question_course = await getQuestionCourse(question, variant_course);
      },
      (callback) => {
        const instance_question_id = null;
        const course_instance_id = (course_instance && course_instance.id) || null;
        const options = {};
        const require_open = true;
        const client_fingerprint_id = null;
        const generateStart = Date.now();
        ensureVariant(
          question.id,
          instance_question_id,
          authn_user_id,
          authn_user_id,
          group_work,
          course_instance_id,
          variant_course,
          question_course,
          options,
          require_open,
          client_fingerprint_id,
          (err, ret_variant) => {
            const generateEnd = Date.now();
            generateDuration = generateEnd - generateStart;
            if (ERR(err, callback)) return;
            variant = ret_variant;
            debug('_testQuestion()', 'created variant_id: :', variant.id);
            callback(null);
          },
        );
      },
      (callback) => {
        const renderStart = Date.now();
        getAndRenderVariant(
          variant.id,
          null,
          {
            question,
            course: variant_course,
            urlPrefix: `/pl/course/${variant_course.id}`,
            authz_data: {},
          },
          (err) => {
            const renderEnd = Date.now();
            renderDuration = renderEnd - renderStart;
            if (ERR(err, callback)) return;
            debug('_testQuestion()', 'rendered variant');
            callback(null);
          },
        );
      },
      (callback) => {
        if (variant.broken) return callback(null);
        const gradeStart = Date.now();
        testVariant(
          variant,
          question,
          variant_course,
          test_type,
          authn_user_id,
          (err, ret_expected_submission, ret_test_submission) => {
            const gradeEnd = Date.now();
            gradeDuration = gradeEnd - gradeStart;
            if (ERR(err, callback)) return;
            expected_submission = ret_expected_submission;
            test_submission = ret_test_submission;
            debug(
              '_testQuestion()',
              'tested',
              'expected_submission_id:',
              expected_submission ? expected_submission.id : null,
              'test_submission_id:',
              test_submission ? test_submission.id : null,
            );
            callback(null);
          },
        );
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      debug('_testQuestion()', 'returning');
      const stats = { generateDuration, renderDuration, gradeDuration };
      callback(null, variant, expected_submission, test_submission, stats);
    },
  );
}

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
 * @param {'correct' | 'incorrect' | 'invalid'} test_type - The type of test to run.
 * @param {string} authn_user_id - The currently authenticated user.
 */
async function runTest(
  logger,
  showDetails,
  question,
  group_work,
  course_instance,
  course,
  test_type,
  authn_user_id,
) {
  let variant,
    expected_submission,
    test_submission,
    stats,
    success = true;
  await async.series([
    (callback) => {
      logger.verbose('Testing ' + question.qid);
      testQuestion(
        question,
        group_work,
        course_instance,
        course,
        test_type,
        authn_user_id,
        (err, ret_variant, ret_expected_submission, ret_test_submission, ret_stats) => {
          if (ERR(err, callback)) return;
          variant = ret_variant;
          expected_submission = ret_expected_submission;
          test_submission = ret_test_submission;
          stats = ret_stats;
          callback(null);
        },
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
      logger.verbose('variant:\n' + jsonStringifySafe(_.pick(variant, variantKeys), null, '    '));
      if (_.isObject(expected_submission)) {
        logger.verbose(
          'expected_submission:\n' +
            jsonStringifySafe(_.pick(expected_submission, submissionKeys), null, '    '),
        );
      }
      if (_.isObject(test_submission)) {
        logger.verbose(
          'test_submission:\n' +
            jsonStringifySafe(_.pick(test_submission, submissionKeys), null, '    '),
        );
      }
      callback(null);
    },
    async () => {
      const result = await sqldb.queryOneRowAsync(sql.select_issue_count_for_variant, {
        variant_id: variant.id,
      });

      if (result.rows[0].count > 0) {
        success = false;
        logger.verbose(`ERROR: ${result.rows[0].count} issues encountered during test.`);
      } else {
        logger.verbose('Success: no issues during test');
      }
    },
  ]);

  return { success, stats };
}

/**
 * Start a job sequence to test a question.
 *
 * @param {number} count - The number of times to test, will run each possible test ('correct, 'incorrect,' invalid') this many times.
 * @param {boolean} showDetails - Whether to display test data details.
 * @param {Object} question - The question for the variant.
 * @param {boolean} group_work - If the assessment will support group work
 * @param {Object} course_instance - The course instance for the variant; may be null for instructor questions
 * @param {Object} course - The course for the variant.
 * @param {string} authn_user_id - The currently authenticated user.
 * @return {Promise<string>} The job sequence ID.
 */
export async function startTestQuestion(
  count,
  showDetails,
  question,
  group_work,
  course_instance,
  course,
  authn_user_id,
) {
  let success = true;
  const test_types = /** @type {const} */ (['correct', 'incorrect', 'invalid']);

  const serverJob = await createServerJob({
    courseId: course.id,
    userId: String(authn_user_id),
    authnUserId: String(authn_user_id),
    type: 'test_question',
    description: 'Test ' + question.qid,
  });

  const stats = [];

  serverJob.executeInBackground(async (job) => {
    await async.eachSeries(_.range(count * test_types.length), async (iter) => {
      let type = test_types[iter % test_types.length];
      job.verbose(`Test ${Math.floor(iter / test_types.length) + 1}, type ${type}`);
      const result = await runTest(
        job,
        showDetails,
        question,
        group_work,
        course_instance,
        course,
        type,
        authn_user_id,
      );
      success = success && result.success;
      if (result.stats) {
        stats.push(result.stats);
      }
    });

    function printStats(label, key) {
      let min = Number.MAX_SAFE_INTEGER;
      let max = 0;
      let count = 0;
      let sum = 0;
      stats.forEach((stat) => {
        const value = stat[key];
        if (value == null) return;
        count += 1;
        sum += value;
        min = Math.min(min, value);
        max = Math.max(max, value);
      });

      if (count === 0) {
        job.verbose(`${label} No data`);
        return;
      }

      const avg = Math.round((sum / count) * 100) / 100;
      job.info(`${label} ${count} tests, min ${min}ms, avg ${avg}ms, max ${max}ms`);
    }

    printStats('Generate/prepare:', 'generateDuration');
    printStats('Render:          ', 'renderDuration');
    printStats('Parse/grade:     ', 'gradeDuration');

    if (!success) {
      throw new Error('Some tests failed. See the "Errors" page for details.');
    }
  });

  return serverJob.jobSequenceId;
}

/**
 *
 * @param {string} submission_id
 * @returns {Promise<import('./db-types').Submission>}
 */
async function selectSubmission(submission_id) {
  return await sqldb.queryRow(sql.select_submission_by_id, { submission_id }, SubmissionSchema);
}
