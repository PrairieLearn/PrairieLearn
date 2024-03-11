import * as async from 'async';
import * as ejs from 'ejs';
import * as path from 'path';
import debugfn from 'debug';
import { z } from 'zod';
import { callbackify, promisify } from 'util';

import * as error from '@prairielearn/error';
import { gradeVariant } from './grading';
import * as sqldb from '@prairielearn/postgres';
import * as ltiOutcomes from './ltiOutcomes';
import { createServerJob } from './server-jobs';
import {
  CourseSchema,
  IdSchema,
  QuestionSchema,
  VariantSchema,
  ClientFingerprintSchema,
  AssessmentInstanceSchema,
} from './db-types';

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
  client_fingerprint: ClientFingerprintSchema.nullable(),
  client_fingerprint_number: z.number().nullable(),
  formatted_date: z.string(),
  date_iso8601: z.string(),
  student_question_number: z.string().nullable(),
  instructor_question_number: z.string().nullable(),
});
export type InstanceLogEntry = z.infer<typeof InstanceLogSchema>;

/**
 * Check that an assessment_instance_id really belongs to the given assessment_id
 *
 * @param assessment_instance_id - The assessment instance to check.
 * @param assessment_id - The assessment it should belong to.
 * @returns Throws an error if the assessment instance doesn't belong to the assessment.
 */
export async function checkBelongsAsync(
  assessment_instance_id: string,
  assessment_id: string,
): Promise<void> {
  if (
    (await sqldb.queryOptionalRow(
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
 * @param assessment - The assessment to render the text for.
 * @param urlPrefix - The current server urlPrefix.
 * @returns The rendered text.
 */
export function renderText(
  assessment: { id: string; text: string | null },
  urlPrefix: string,
): string | null {
  if (!assessment.text) return null;

  const assessmentUrlPrefix = urlPrefix + '/assessment/' + assessment.id;

  const context = {
    clientFilesCourse: assessmentUrlPrefix + '/clientFilesCourse',
    clientFilesCourseInstance: assessmentUrlPrefix + '/clientFilesCourseInstance',
    clientFilesAssessment: assessmentUrlPrefix + '/clientFilesAssessment',
  };
  return ejs.render(assessment.text, context);
}

/**
 * Create a new assessment instance and all the questions in it.
 *
 * @param assessment_id - The assessment to create the assessment instance for.
 * @param user_id - The user who will own the new assessment instance.
 * @param group_work - If the assessment will support group work.
 * @param authn_user_id - The current authenticated user.
 * @param mode - The mode for the new assessment instance.
 * @param time_limit_min - The time limit for the new assessment instance.
 * @param date - The date of creation for the new assessment instance.
 * @returns The ID of the new assessment instance.
 */
export async function makeAssessmentInstance(
  assessment_id: string,
  user_id: string,
  group_work: boolean,
  authn_user_id: string,
  mode: 'Exam' | 'Homework',
  time_limit_min: number | null,
  date: Date,
  client_fingerprint_id: string | null,
): Promise<string> {
  const result = await sqldb.callOneRowAsync('assessment_instances_insert', [
    assessment_id,
    user_id,
    group_work,
    authn_user_id,
    mode,
    time_limit_min,
    date,
    client_fingerprint_id,
  ]);
  return result.rows[0].assessment_instance_id;
}

/**
 * Add new questions to the assessment instance and regrade it if necessary.
 *
 * @param assessment_instance_id - The assessment instance to grade.
 * @param authn_user_id - The current authenticated user.
 * @returns Whether the assessment instance was updated.
 */
export async function update(
  assessment_instance_id: string,
  authn_user_id: string,
): Promise<boolean> {
  debug('update()');
  const updated = await sqldb.runInTransactionAsync(async () => {
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
 * @param assessment_instance_id - The assessment instance to grade.
 * @param authn_user_id - The current authenticated user.
 * @param requireOpen - Whether to enforce that the assessment instance is open before grading.
 * @param close - Whether to close the assessment instance after grading.
 * @param overrideGradeRate - Whether to override grade rate limits.
 */
export async function gradeAssessmentInstance(
  assessment_instance_id: string,
  authn_user_id: string | null,
  requireOpen: boolean,
  close: boolean,
  overrideGradeRate: boolean,
  client_fingerprint_id: string | null,
): Promise<void> {
  debug('gradeAssessmentInstance()');
  overrideGradeRate = close || overrideGradeRate;

  if (requireOpen || close) {
    await sqldb.runInTransactionAsync(async () => {
      const assessmentInstance = await sqldb.queryOptionalRow(
        sql.select_and_lock_assessment_instance,
        { assessment_instance_id },
        AssessmentInstanceSchema,
      );
      if (assessmentInstance == null) {
        throw error.make(404, 'Assessment instance not found');
      }
      if (!assessmentInstance.open) {
        throw error.make(403, 'Assessment instance is not open');
      }

      if (close) {
        // If we're supposed to close the assessment, do it *before* we
        // we start grading. This avoids a race condition where the student
        // makes an additional submission while grading is already in progress.
        await sqldb.queryAsync(sql.close_assessment_instance, {
          assessment_instance_id,
          authn_user_id,
          client_fingerprint_id,
        });
      }
    });
  }

  const variants = await sqldb.queryRows(
    sql.select_variants_for_assessment_instance_grading,
    { assessment_instance_id },
    z.object({ variant: VariantSchema, question: QuestionSchema, variant_course: CourseSchema }),
  );
  debug('gradeAssessmentInstance()', 'selected variants', 'count:', variants.length);
  await async.eachSeries(variants, async (row) => {
    debug('gradeAssessmentInstance()', 'loop', 'variant.id:', row.variant.id);
    const check_submission_id = null;
    await gradeVariant(
      row.variant,
      check_submission_id,
      row.question,
      row.variant_course,
      authn_user_id,
      overrideGradeRate,
    );
  });
  // The `grading_needed` flag was set by the closing query above. Once we've
  // successfully graded every part of the assessment instance, set the flag to
  // false so that we don't try to grade it again in the future.
  //
  // This flag exists only to handle the case where we close the exam but then
  // the PrairieLearn server crashes before we can grade it. In that case, the
  // `autoFinishExams` cronjob will detect that the assessment instance hasn't
  // been fully graded and will grade any ungraded portions of it.
  //
  // There's a potential race condition here where the `autoFinishExams` cronjob
  // runs after closing the instance but before the above calls to
  // `gradeVariant` have finished. In that case, we'll concurrently try to grade
  // the same variant twice. This shouldn't impact correctness, as
  // `gradeVariant` is resilient to being run multiple times concurrently. The
  // only bad thing that will happen is that we'll have wasted some work, but
  // that's acceptable.
  await sqldb.queryAsync(sql.unset_grading_needed, { assessment_instance_id });
}

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
 * @param assessment_id - The assessment to grade.
 * @param user_id - The current user performing the update.
 * @param authn_user_id - The current authenticated user.
 * @param close - Whether to close the assessment instances after grading.
 * @param overrideGradeRate - Whether to override grade rate limits.
 * @returns The ID of the new job sequence.
 */
export async function gradeAllAssessmentInstances(
  assessment_id: string,
  user_id: string,
  authn_user_id: string,
  close: boolean,
  overrideGradeRate: boolean,
): Promise<string> {
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
      await gradeAssessmentInstance(
        row.assessment_instance_id,
        authn_user_id,
        requireOpen,
        close,
        overrideGradeRate,
        null,
      );
    });
  });

  return serverJob.jobSequenceId;
}

/**
 * Updates statistics for all assessments in a course instance, but only if an
 * update is needed.
 *
 * @param course_instance_id - The course instance ID.
 */
export async function updateAssessmentStatisticsForCourseInstance(
  course_instance_id: string,
): Promise<void> {
  const rows = await sqldb.queryRows(
    sql.select_assessments_for_statistics_update,
    { course_instance_id },
    IdSchema,
  );
  await async.eachLimit(rows, 3, updateAssessmentStatistics);
}

/**
 * Updates statistics for an assessment, if needed.
 *
 * @param assessment_id - The assessment ID.
 */
export async function updateAssessmentStatistics(assessment_id: string): Promise<void> {
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

export async function updateAssessmentInstanceScore(
  assessment_instance_id: string,
  score_perc: number,
  authn_user_id: string,
): Promise<void> {
  await sqldb.runInTransactionAsync(async () => {
    const { max_points } = await sqldb.queryRow(
      sql.select_and_lock_assessment_instance,
      { assessment_instance_id },
      AssessmentInstanceSchema,
    );
    const points = (score_perc * (max_points ?? 0)) / 100;
    await sqldb.queryAsync(sql.update_assessment_instance_score, {
      assessment_instance_id,
      score_perc,
      points,
      authn_user_id,
    });
  });
}

export async function updateAssessmentInstancePoints(
  assessment_instance_id: string,
  points: number,
  authn_user_id: string,
): Promise<void> {
  await sqldb.runInTransactionAsync(async () => {
    const { max_points } = await sqldb.queryRow(
      sql.select_and_lock_assessment_instance,
      { assessment_instance_id },
      AssessmentInstanceSchema,
    );
    const score_perc = (points / (max_points != null && max_points > 0 ? max_points : 1)) * 100;
    await sqldb.queryAsync(sql.update_assessment_instance_score, {
      assessment_instance_id,
      score_perc,
      points,
      authn_user_id,
    });
  });
}

/**
 * Selects a log of all events associated to an assessment instance.
 *
 * @param assessment_instance_id - The ID of the assessment instance.
 * @param include_files - A flag indicating if submitted files should be included in the
 * log.
 * @returns the results of the log query.
 */
export async function selectAssessmentInstanceLog(
  assessment_instance_id: string,
  include_files: boolean,
): Promise<InstanceLogEntry[]> {
  const log: InstanceLogEntry[] = await sqldb.queryRows(
    sql.assessment_instance_log,
    { assessment_instance_id, include_files },
    InstanceLogSchema,
  );
  const fingerprintNumbers = {};
  let i = 1;
  log.forEach((row) => {
    if (row.client_fingerprint) {
      if (!fingerprintNumbers[row.client_fingerprint.id]) {
        fingerprintNumbers[row.client_fingerprint.id] = i;
        i++;
      }
      row.client_fingerprint_number = fingerprintNumbers[row.client_fingerprint.id];
    }
  });
  return log;
}

export async function selectAssessmentInstanceLogCursor(
  assessment_instance_id,
  include_files,
): Promise<sqldb.CursorIterator<InstanceLogEntry>> {
  return sqldb.queryValidatedCursor(
    sql.assessment_instance_log,
    { assessment_instance_id, include_files },
    InstanceLogSchema,
  );
}

export async function updateAssessmentQuestionStats(assessment_question_id: string): Promise<void> {
  await sqldb.queryAsync(sql.calculate_stats_for_assessment_question, { assessment_question_id });
}

export async function updateAssessmentQuestionStatsForAssessment(
  assessment_id: string,
): Promise<void> {
  await sqldb.runInTransactionAsync(async () => {
    const assessment_questions = await sqldb.queryRows(
      sql.select_assessment_questions,
      { assessment_id },
      IdSchema,
    );
    await async.eachLimit(assessment_questions, 3, updateAssessmentQuestionStats);
    await sqldb.queryAsync(sql.update_assessment_stats_last_updated, { assessment_id });
  });
}

export async function deleteAssessmentInstance(
  assessment_id: string,
  assessment_instance_id: string,
  authn_user_id: string,
): Promise<void> {
  const deleted_id = await sqldb.queryOptionalRow(
    sql.delete_assessment_instance,
    { assessment_id, assessment_instance_id, authn_user_id },
    IdSchema,
  );
  if (deleted_id == null) {
    throw error.make(403, 'This assessment instance does not exist in this assessment.');
  }
}

export async function deleteAllAssessmentInstancesForAssessment(
  assessment_id: string,
  authn_user_id: string,
): Promise<void> {
  await sqldb.queryAsync(sql.delete_all_assessment_instances_for_assessment, {
    assessment_id,
    authn_user_id,
  });
}
