// @ts-check
const _ = require('lodash');
import * as async from 'async';
import * as ejs from 'ejs';
import * as path from 'path';
import debugfn from 'debug';
import { z } from 'zod';
import { callbackify, promisify } from 'util';

import * as error from '@prairielearn/error';
import * as question from './question';
const externalGrader = require('./externalGrader');
import * as externalGradingSocket from './externalGradingSocket';
import * as sqldb from '@prairielearn/postgres';
import * as ltiOutcomes from './ltiOutcomes';
import { createServerJob } from './server-jobs';
import { IdSchema } from './db-types';

const debug = debugfn('prairielearn:' + path.basename(__filename, '.js'));
const sql = sqldb.loadSqlEquiv(__filename);

export const InstanceLogSchema = z.object({
  event_name: z.string(),
  event_color: z.string(),
  event_date: z.date(),
  auth_user_uid: z.string().nullable(),
  qid: z.string().nullable(),
  question_id: z.string().nullable(),
  instance_question_id: z.string().nullable(),
  variant_id: z.string().nullable(),
  variant_number: z.number().nullable(),
  submission_id: z.string().nullable(),
  data: z.record(z.any()).nullable(),
  formatted_date: z.string(),
  date_iso8601: z.string(),
  student_question_number: z.string().nullable(),
  instructor_question_number: z.string().nullable(),
});

/**
 * Assessment module.
 * @module assessment
 */

/**
 * Check that an assessment_instance_id really belongs to the given assessment_id
 *
 * @param {string} assessment_instance_id - The assessment instance to check.
 * @param {string} assessment_id - The assessment it should belong to.
 */
export async function checkBelongsAsync(assessment_instance_id, assessment_id) {
  if (
    (await sqldb.queryRow(
      sql.check_belongs,
      { assessment_instance_id, assessment_id },
      IdSchema,
    )) == null
  ) {
    throw error.make(403, 'access denied');
  }
}
export const checkBelongs = callbackify(checkBelongsAsync);

/**
 * Render the "text" property of an assessment.
 *
 * @param {Object} assessment - The assessment to render the text for.
 * @param {string} urlPrefix - The current server urlPrefix.
 */
export function renderText(assessment, urlPrefix) {
  if (!assessment.text) return null;

  const assessmentUrlPrefix = urlPrefix + '/assessment/' + assessment.id;

  var context = {
    clientFilesCourse: assessmentUrlPrefix + '/clientFilesCourse',
    clientFilesCourseInstance: assessmentUrlPrefix + '/clientFilesCourseInstance',
    clientFilesAssessment: assessmentUrlPrefix + '/clientFilesAssessment',
  };
  return ejs.render(assessment.text, context);
}

/**
 * Create a new assessment instance and all the questions in it.
 *
 * @param {string} assessment_id - The assessment to create the assessment instance for.
 * @param {string} user_id - The user who will own the new assessment instance.
 * @param {boolean} group_work - If the assessment will support group work.
 * @param {string} authn_user_id - The current authenticated user.
 * @param {string} mode - The mode for the new assessment instance.
 * @param {?number} time_limit_min - The time limit for the new assessment instance.
 * @param {Date} date - The date of creation for the new assessment instance.
 */
export async function makeAssessmentInstance(
  assessment_id,
  user_id,
  group_work,
  authn_user_id,
  mode,
  time_limit_min,
  date,
) {
  const result = await sqldb.callOneRowAsync('assessment_instances_insert', [
    assessment_id,
    user_id,
    group_work,
    authn_user_id,
    mode,
    time_limit_min,
    date,
  ]);
  return result.rows[0].assessment_instance_id;
}

/**
 * Add new questions to the assessment instance and regrade it if necessary.
 *
 * @param {string} assessment_instance_id - The assessment instance to grade.
 * @param {string} authn_user_id - The current authenticated user.
 */
export async function update(assessment_instance_id, authn_user_id) {
  debug('update()');
  const updated = await sqldb.runInTransactionAsync(async () => {
    await sqldb.callAsync('assessment_instances_lock', [assessment_instance_id]);
    const updateResult = await sqldb.callOneRowAsync('assessment_instances_update', [
      assessment_instance_id,
      authn_user_id,
    ]);
    if (!updateResult.rows[0].updated) return false; // skip if not updated

    // if updated, regrade to pick up max_points changes, etc.
    await sqldb.callOneRowAsync('assessment_instances_grade', [
      assessment_instance_id,
      authn_user_id,
      null, // credit
      true, // only_log_if_score_updated
    ]);
    return true;
  });
  // Don't try to update LTI score if the assessment wasn't updated.
  if (updated) {
    // NOTE: It's important that this is run outside of `runInTransaction`
    // above. This will hit the network, and as a rule we don't do any
    // potentially long-running work inside of a transaction.
    await promisify(ltiOutcomes.updateScore)(assessment_instance_id);
  }
  return updated;
}

/**
 * Grade all questions in an assessment instance and (optionally) close it.
 *
 * All user-facing routes should set `requireOpen` to true. However, internal
 * functions that asynchronously grade exams can set `requireOpen` to false
 * if needed.
 *
 * @param {string} assessment_instance_id - The assessment instance to grade.
 * @param {string | null} authn_user_id - The current authenticated user.
 * @param {boolean} requireOpen - Whether to enforce that the assessment instance is open before grading.
 * @param {boolean} close - Whether to close the assessment instance after grading.
 * @param {boolean} overrideGradeRate - Whether to override grade rate limits.
 */
export async function gradeAssessmentInstanceAsync(
  assessment_instance_id,
  authn_user_id,
  requireOpen,
  close,
  overrideGradeRate,
) {
  debug('gradeAssessmentInstance()');
  overrideGradeRate = close || overrideGradeRate;

  // We may have to submit grading jobs to the external grader after this
  // grading transaction has been accepted; collect those job ids here.
  const externalGradingJobIds = [];

  if (requireOpen) {
    await sqldb.callAsync('assessment_instances_ensure_open', [assessment_instance_id]);
  }

  if (close) {
    // If we're supposed to close the assessment, do it *before* we
    // we start grading. This avoids a race condition where the student
    // makes an additional submission while grading is already in progress.
    await sqldb.callAsync('assessment_instances_close', [assessment_instance_id, authn_user_id]);
  }
  const result = await sqldb.callAsync('variants_select_for_assessment_instance_grading', [
    assessment_instance_id,
  ]);
  const rows = result.rows;
  debug('gradeAssessmentInstance()', 'selected variants', 'count:', rows.length);
  await async.eachSeries(rows, async (row) => {
    debug('gradeAssessmentInstance()', 'loop', 'variant.id:', row.variant.id);
    const check_submission_id = null;
    const gradingJobId = await promisify(question.gradeVariant)(
      row.variant,
      check_submission_id,
      row.question,
      row.variant_course,
      authn_user_id,
      overrideGradeRate,
    );
    if (gradingJobId !== undefined) {
      externalGradingJobIds.push(gradingJobId);
    }
  });
  if (externalGradingJobIds.length > 0) {
    // We need to submit these grading jobs to be graded
    await externalGrader.beginGradingJobs(externalGradingJobIds);
  }
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
  // impact correctness, as `gradeVariant` is resilient to being run
  // multiple times concurrently. The only bad thing that will happen
  // is that we'll have wasted some work, but that's acceptable.
  await sqldb.queryAsync(sql.unset_grading_needed, { assessment_instance_id });
}
export const gradeAssessmentInstance = callbackify(gradeAssessmentInstanceAsync);

const AssessmentInfoSchema = z.object({
  assessment_label: z.string(),
  course_instance_id: IdSchema,
  course_id: IdSchema,
});

const InstancesToGradeSchema = z.object({
  assessment_instance_id: IdSchema,
  instance_number: z.number(),
  username: z.string(),
});

/**
 * Grade all assessment instances and (optionally) close them.
 *
 * @param {string} assessment_id - The assessment to grade.
 * @param {string} user_id - The current user performing the update.
 * @param {string} authn_user_id - The current authenticated user.
 * @param {boolean} close - Whether to close the assessment instances after grading.
 * @param {boolean} overrideGradeRate - Whether to override grade rate limits.
 */
export async function gradeAllAssessmentInstances(
  assessment_id,
  user_id,
  authn_user_id,
  close,
  overrideGradeRate,
) {
  debug('gradeAllAssessmentInstances()');
  const { assessment_label, course_instance_id, course_id } = await sqldb.queryRow(
    sql.select_assessment_info,
    { assessment_id },
    AssessmentInfoSchema,
  );

  const serverJob = await createServerJob({
    courseId: course_id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_id,
    userId: user_id,
    authnUserId: authn_user_id,
    type: 'grade_all_assessment_instances',
    description: 'Grade all assessment instances for ' + assessment_label,
  });

  serverJob.executeInBackground(async (job) => {
    job.info('Grading assessment instances for ' + assessment_label);

    const instances = await sqldb.queryRows(
      sql.select_instances_to_grade,
      { assessment_id },
      InstancesToGradeSchema,
    );
    job.info(instances.length === 1 ? 'One instance found' : instances.length + ' instances found');
    await async.eachSeries(instances, async (row) => {
      job.info(`Grading assessment instance #${row.instance_number} for ${row.username}`);
      const requireOpen = true;
      await gradeAssessmentInstanceAsync(
        row.assessment_instance_id,
        authn_user_id,
        requireOpen,
        close,
        overrideGradeRate,
      );
    });
  });

  return serverJob.jobSequenceId;
}

/**
 * Process the result of an external grading job.
 *
 * @param {Object} content - The grading job data to process.
 */
export async function processGradingResult(content) {
  try {
    if (!_.isObject(content.grading)) {
      throw error.makeWithData('invalid grading', { content: content });
    }

    if (_(content.grading).has('feedback') && !_(content.grading.feedback).isObject()) {
      throw error.makeWithData('invalid grading.feedback', { content: content });
    }

    // There are two "succeeded" flags in the grading results. The first
    // is at the top level and is set by `grader-host`; the second is in
    // `results` and is set by course code.
    //
    // If the top-level flag is false, that means there was a serious
    // error in the grading process and we should treat the submission
    // as not gradable. This avoids penalizing students for issues outside
    // their control.
    const jobSucceeded = !!content.grading?.feedback?.succeeded;

    const succeeded = !!(content.grading.feedback?.results?.succeeded ?? true);
    if (!succeeded) {
      content.grading.score = 0;
    }

    // The submission is only gradable if the job as a whole succeeded
    // and the course code marked it as gradable. We default to true for
    // backwards compatibility with graders that don't set this flag.
    let gradable = jobSucceeded && !!(content.grading.feedback?.results?.gradable ?? true);

    if (gradable) {
      // We only care about the score if it is gradable.
      if (typeof content.grading.score === 'undefined') {
        content.grading.feedback = {
          results: { succeeded: false, gradable: false },
          message: 'Error parsing external grading results: score was not provided.',
          original_feedback: content.grading.feedback,
        };
        content.grading.score = 0;
        gradable = false;
      }
      if (!_(content.grading.score).isFinite()) {
        content.grading.feedback = {
          results: { succeeded: false, gradable: false },
          message: 'Error parsing external grading results: score is not a number.',
          original_feedback: content.grading.feedback,
        };
        content.grading.score = 0;
        gradable = false;
      }
      if (content.grading.score < 0 || content.grading.score > 1) {
        content.grading.feedback = {
          results: { succeeded: false, gradable: false },
          message: 'Error parsing external grading results: score is out of range.',
          original_feedback: content.grading.feedback,
        };
        content.grading.score = 0;
        gradable = false;
      }
    }

    await sqldb.callAsync('grading_jobs_update_after_grading', [
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
    ]);
    const assessment_instance_id = await sqldb.queryRow(
      sql.select_assessment_for_grading_job,
      { grading_job_id: content.gradingId },
      IdSchema,
    );
    await promisify(ltiOutcomes.updateScore)(assessment_instance_id);
  } finally {
    externalGradingSocket.gradingJobStatusUpdated(content.gradingId);
  }
}

/**
 * Updates statistics for all assessments in a course instance, but only if an
 * update is needed.
 *
 * @param {string} course_instance_id - The course instance ID.
 */
export async function updateAssessmentStatisticsForCourseInstance(course_instance_id) {
  const rows = await sqldb.queryRows(
    sql.select_assessments_for_statistics_update,
    { course_instance_id },
    IdSchema,
  );
  await async.eachLimit(rows, 3, async (assessment_id) => {
    await module.exports.updateAssessmentStatistics(assessment_id);
  });
}

/**
 * Updates statistics for an assessment, if needed.
 *
 * @param {number} assessment_id - The assessment ID.
 */
export async function updateAssessmentStatistics(assessment_id) {
  await sqldb.runInTransactionAsync(async () => {
    // lock the assessment
    await sqldb.queryOneRowAsync(sql.select_assessment_lock, { assessment_id });

    // check whether we need to update the statistics
    const needs_statistics_update = await sqldb.queryRow(
      sql.select_assessment_needs_statisics_update,
      { assessment_id },
      z.boolean(),
    );
    if (!needs_statistics_update) return;

    // update the statistics
    await sqldb.queryOneRowAsync(sql.update_assessment_statisics, { assessment_id });
  });
}

/**
 * Selects a log of all events associated to an assessment instance.
 *
 * @param {string} assessment_instance_id - The ID of the assessment instance.
 * @param {boolean} include_files - A flag indicating if submitted files should be included in the
 * log.
 * @returns {Promise<Array<z.infer<typeof InstanceLogSchema>>>} the results of the log query.
 */
export async function selectAssessmentInstanceLog(assessment_instance_id, include_files) {
  return sqldb.queryRows(
    sql.assessment_instance_log,
    { assessment_instance_id, include_files },
    InstanceLogSchema,
  );
}

export async function selectAssessmentInstanceLogCursor(assessment_instance_id, include_files) {
  return sqldb.queryValidatedCursor(
    sql.assessment_instance_log,
    { assessment_instance_id, include_files },
    InstanceLogSchema,
  );
}
