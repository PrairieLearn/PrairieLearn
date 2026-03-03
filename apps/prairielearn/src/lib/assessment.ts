import * as async from 'async';
import debugfn from 'debug';
import mustache from 'mustache';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import { selectAssessmentInfoForJob } from '../models/assessment.js';

import {
  computeAssessmentInstanceScoreByZone,
  updateAssessmentInstanceGrade,
} from './assessment-grading.js';
import {
  type Assessment,
  type AssessmentInstance,
  AssessmentInstanceSchema,
  ClientFingerprintSchema,
  CourseSchema,
  QuestionSchema,
  type User,
  VariantSchema,
} from './db-types.js';
import { gradeVariant } from './grading.js';
import { getGroupId } from './groups.js';
import * as ltiOutcomes from './ltiOutcomes.js';
import { createServerJob } from './server-jobs.js';

const debug = debugfn('prairielearn:assessment');
const sql = sqldb.loadSqlEquiv(import.meta.url);

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
export async function checkBelongs(
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
    throw new error.HttpStatusError(403, 'access denied');
  }
}

/**
 * Render the "text" property of an assessment.
 *
 * @param assessment - The assessment to render the text for.
 * @param assessment.id - The assessment ID.
 * @param assessment.text - The assessment text.
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
    client_files_course: assessmentUrlPrefix + '/clientFilesCourse',
    client_files_course_instance: assessmentUrlPrefix + '/clientFilesCourseInstance',
    client_files_assessment: assessmentUrlPrefix + '/clientFilesAssessment',
  };

  // Convert all legacy EJS-style template variables to Mustache template variables.
  const text = assessment.text
    .replaceAll(/<%=\s*clientFilesCourse\s*%>/g, '{{ client_files_course }}')
    .replaceAll(/<%=\s*clientFilesCourseInstance\s*%>/g, '{{ client_files_course_instance }}')
    .replaceAll(/<%=\s*clientFilesAssessment\s*%>/g, '{{ client_files_assessment }}');

  return mustache.render(text, context);
}

/**
 * Create a new assessment instance and all the questions in it.
 * @param params
 * @param params.assessment - The assessment to create the assessment instance for.
 * @param params.user_id - The user who will own the new assessment instance.
 * @param params.authn_user_id - The current authenticated user.
 * @param params.mode - The mode for the new assessment instance.
 * @param params.time_limit_min - The time limit for the new assessment instance.
 * @param params.date - The date of creation for the new assessment instance.
 * @param params.client_fingerprint_id - The client fingerprint ID.
 * @returns The ID of the new assessment instance.
 */
export async function makeAssessmentInstance({
  assessment,
  user_id,
  authn_user_id,
  mode,
  time_limit_min,
  date,
  client_fingerprint_id,
}: {
  assessment: Assessment;
  user_id: string;
  authn_user_id: string;
  mode: AssessmentInstance['mode'];
  time_limit_min: number | null;
  date: Date;
  client_fingerprint_id: string | null;
}): Promise<string> {
  return await sqldb.runInTransactionAsync(async () => {
    let group_id: string | null = null;
    if (assessment.team_work) {
      group_id = await getGroupId(assessment.id, user_id);
      if (group_id == null) {
        throw new error.HttpStatusError(403, 'No group found for this user in this assessment');
      }
    }

    const { assessment_instance_id, created } = await sqldb.queryRow(
      sql.insert_assessment_instance,
      {
        assessment_id: assessment.id,
        group_id,
        user_id,
        mode,
        time_limit_min,
        date,
        client_fingerprint_id,
        authn_user_id,
      },
      z.object({ assessment_instance_id: IdSchema, created: z.boolean() }),
    );

    // Only update the assessment instance if a new instance was created.
    if (created) {
      await updateAssessmentInstance(assessment_instance_id, authn_user_id, false);
    }

    return assessment_instance_id;
  });
}

/**
 * Add new questions to the assessment instance and regrade it if necessary.
 *
 * @param assessment_instance_id - The assessment instance to grade.
 * @param authn_user_id - The current authenticated user.
 * @param recomputeGrades - Whether to recompute the grades after adding the questions. Should only be false when the caller takes responsibility for grading the assessment instance later.
 * @returns Whether the assessment instance was updated.
 */
export async function updateAssessmentInstance(
  assessment_instance_id: string,
  authn_user_id: string,
  recomputeGrades = true,
): Promise<boolean> {
  const updated = await sqldb.runInTransactionAsync(async () => {
    const assessmentInstance = await sqldb.queryOptionalRow(
      sql.select_and_lock_assessment_instance,
      { assessment_instance_id },
      AssessmentInstanceSchema,
    );
    if (assessmentInstance == null) {
      throw new error.HttpStatusError(404, 'Assessment instance not found');
    }
    if (!assessmentInstance.open) {
      // Silently return without updating
      return false;
    }

    // Insert any new questions not previously in the assessment instance
    const newInstanceQuestionIds = await sqldb.queryRows(
      sql.insert_instance_questions,
      { assessment_instance_id, assessment_id: assessmentInstance.assessment_id, authn_user_id },
      IdSchema,
    );

    const pointsByZone = await computeAssessmentInstanceScoreByZone({ assessment_instance_id });
    const totalPointsZones = pointsByZone.reduce((sum, zone) => sum + zone.max_points, 0);

    const newMaxPoints = await sqldb.queryOptionalRow(
      sql.update_assessment_instance_max_points,
      { assessment_instance_id, total_points_zones: totalPointsZones, authn_user_id },
      AssessmentInstanceSchema.pick({ max_points: true, max_bonus_points: true }),
    );
    // If assessment was not updated, grades do not need to be recomputed.
    if (newInstanceQuestionIds.length === 0 && newMaxPoints == null) return false;

    // if updated, regrade to pick up max_points changes, etc.
    if (recomputeGrades) {
      await updateAssessmentInstanceGrade({
        assessment_instance_id,
        authn_user_id,
        onlyLogIfScoreUpdated: true,
        precomputedPointsByZone: pointsByZone,
      });
    }
    return true;
  });
  // Don't try to update LTI score if the assessment wasn't updated.
  if (updated && recomputeGrades) {
    // NOTE: It's important that this is run outside of `runInTransaction`
    // above. This will hit the network, and as a rule we don't do any
    // potentially long-running work inside of a transaction.
    await ltiOutcomes.updateScore(assessment_instance_id);
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
 * @param params
 * @param params.assessment_instance_id - The assessment instance to grade.
 * @param params.user_id - The current effective user.
 * @param params.authn_user_id - The current authenticated user.
 * @param params.requireOpen - Whether to enforce that the assessment instance is open before grading.
 * @param params.close - Whether to close the assessment instance after grading.
 * @param params.ignoreGradeRateLimit - Whether to ignore grade rate limits.
 * @param params.ignoreRealTimeGradingDisabled - Whether to ignore real-time grading disabled checks.
 * @param params.client_fingerprint_id - The client fingerprint ID.
 */
export async function gradeAssessmentInstance({
  assessment_instance_id,
  user_id,
  authn_user_id,
  requireOpen,
  close,
  ignoreGradeRateLimit,
  ignoreRealTimeGradingDisabled,
  client_fingerprint_id,
}: {
  assessment_instance_id: string;
  user_id: string | null;
  authn_user_id: string | null;
  requireOpen: boolean;
  close: boolean;
  ignoreGradeRateLimit: boolean;
  ignoreRealTimeGradingDisabled: boolean;
  client_fingerprint_id: string | null;
}): Promise<void> {
  debug('gradeAssessmentInstance()');
  ignoreGradeRateLimit = close || ignoreGradeRateLimit;
  ignoreRealTimeGradingDisabled = close || ignoreRealTimeGradingDisabled;

  if (requireOpen || close) {
    await sqldb.runInTransactionAsync(async () => {
      const assessmentInstance = await sqldb.queryOptionalRow(
        sql.select_and_lock_assessment_instance,
        { assessment_instance_id },
        AssessmentInstanceSchema,
      );
      if (assessmentInstance == null) {
        throw new error.HttpStatusError(404, 'Assessment instance not found');
      }
      if (!assessmentInstance.open) {
        throw new error.HttpStatusError(403, 'Assessment instance is not open');
      }

      if (close) {
        // If we're supposed to close the assessment, do it *before* we
        // we start grading. This avoids a race condition where the student
        // makes an additional submission while grading is already in progress.
        await sqldb.execute(sql.close_assessment_instance, {
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

    // Skip grading broken variants, as `gradeVariant` will consider an attempt
    // to grade a broken variant as an error.
    if (row.variant.broken_at) return;

    const check_submission_id = null;
    await gradeVariant({
      variant: row.variant,
      check_submission_id,
      question: row.question,
      variant_course: row.variant_course,
      user_id,
      authn_user_id,
      ignoreGradeRateLimit,
      ignoreRealTimeGradingDisabled,
    });
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
  await sqldb.execute(sql.unset_grading_needed, { assessment_instance_id });
}

export async function crossLockpoint({
  assessmentInstance,
  zoneId,
  authnUser,
}: {
  assessmentInstance: AssessmentInstance;
  zoneId: string;
  authnUser: User;
}): Promise<void> {
  const crossedLockpointId = await sqldb.queryOptionalRow(
    sql.cross_lockpoint,
    { assessment_instance_id: assessmentInstance.id, zone_id: zoneId, authn_user_id: authnUser.id },
    IdSchema,
  );
  if (crossedLockpointId != null) return;

  // The INSERT uses ON CONFLICT DO NOTHING, which returns nothing both when
  // the conflict fires (already crossed) and when the WHERE conditions fail
  // (not eligible to cross). This second query distinguishes those cases.
  const alreadyCrossed = await sqldb.queryOptionalRow(
    sql.check_lockpoint_crossed,
    { assessment_instance_id: assessmentInstance.id, zone_id: zoneId },
    IdSchema,
  );
  if (alreadyCrossed != null) return;

  throw new error.HttpStatusError(
    403,
    'Unable to cross this lockpoint. Please return to the assessment overview and try again.',
  );
}

const InstancesToGradeSchema = z.object({
  assessment_instance_id: IdSchema,
  instance_number: z.number(),
  username: z.string(),
});

/**
 * Grade all assessment instances and (optionally) close them.
 *
 * @param params
 * @param params.assessment_id - The assessment to grade.
 * @param params.user_id - The current user performing the update.
 * @param params.authn_user_id - The current authenticated user.
 * @param params.close - Whether to close the assessment instances after grading.
 * @param params.ignoreGradeRateLimit - Whether to ignore grade rate limits.
 * @param params.ignoreRealTimeGradingDisabled - Whether to ignore real-time grading disabled checks.
 * @returns The ID of the new job sequence.
 */
export async function gradeAllAssessmentInstances({
  assessment_id,
  user_id,
  authn_user_id,
  close,
  ignoreGradeRateLimit,
  ignoreRealTimeGradingDisabled,
}: {
  assessment_id: string;
  user_id: string;
  authn_user_id: string;
  close: boolean;
  ignoreGradeRateLimit: boolean;
  ignoreRealTimeGradingDisabled: boolean;
}): Promise<string> {
  debug('gradeAllAssessmentInstances()');
  const { assessment_label, course_instance_id, course_id } =
    await selectAssessmentInfoForJob(assessment_id);

  const serverJob = await createServerJob({
    type: 'grade_all_assessment_instances',
    description: 'Grade all assessment instances for ' + assessment_label,
    userId: user_id,
    authnUserId: authn_user_id,
    courseId: course_id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_id,
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
      await gradeAssessmentInstance({
        assessment_instance_id: row.assessment_instance_id,
        user_id,
        authn_user_id,
        requireOpen: true,
        close,
        ignoreGradeRateLimit,
        ignoreRealTimeGradingDisabled,
        client_fingerprint_id: null,
      });
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
    await sqldb.executeRow(sql.select_assessment_lock, { assessment_id });

    // check whether we need to update the statistics
    const needs_statistics_update = await sqldb.queryRow(
      sql.select_assessment_needs_statistics_update,
      { assessment_id },
      z.boolean(),
    );
    if (!needs_statistics_update) return;

    // update the statistics
    await sqldb.executeRow(sql.update_assessment_statistics, { assessment_id });
  });
}

export async function setAssessmentInstanceScore(
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
    await sqldb.execute(sql.update_assessment_instance_score, {
      assessment_instance_id,
      score_perc,
      points,
      authn_user_id,
    });
  });
}

export async function setAssessmentInstancePoints(
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
    await sqldb.execute(sql.update_assessment_instance_score, {
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
  const fingerprintNumbers: Record<string, number> = {};
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
  assessment_instance_id: string,
  include_files: boolean,
): Promise<sqldb.CursorIterator<InstanceLogEntry>> {
  return sqldb.queryCursor(
    sql.assessment_instance_log,
    { assessment_instance_id, include_files },
    InstanceLogSchema,
  );
}

async function updateAssessmentQuestionStats(assessment_question_id: string): Promise<void> {
  await sqldb.execute(sql.calculate_stats_for_assessment_question, { assessment_question_id });
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
    await sqldb.execute(sql.update_assessment_stats_last_updated, { assessment_id });
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
    throw new error.HttpStatusError(
      403,
      'This assessment instance does not exist in this assessment.',
    );
  }
}

export async function deleteAllAssessmentInstancesForAssessment(
  assessment_id: string,
  authn_user_id: string,
): Promise<void> {
  await sqldb.execute(sql.delete_all_assessment_instances_for_assessment, {
    assessment_id,
    authn_user_id,
  });
}

export async function selectAssessmentInstanceLastSubmissionDate(assessment_instance_id: string) {
  return await sqldb.queryRow(
    sql.select_assessment_instance_last_submission_date,
    { assessment_instance_id },
    DateFromISOString.nullable(),
  );
}
