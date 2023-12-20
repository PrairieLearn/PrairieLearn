// @ts-check

import * as util from 'util';
import * as fs from 'fs';
import * as unzipper from 'unzipper';
import { z } from 'zod';

import * as externalGrader from './externalGrader';
import * as ltiOutcomes from './ltiOutcomes';
import { writeCourseIssues } from './issues';
import { getQuestionCourse } from './question-variant';
import * as sqldb from '@prairielearn/postgres';
import * as questionServers from '../question-servers';
import * as workspaceHelper from './workspace';
import { DateFromISOString, GradingJobSchema, IdSchema, SubmissionSchema } from './db-types';

const sql = sqldb.loadSqlEquiv(__filename);

const NextAllowedGradeSchema = z.object({
  allow_grade_date: DateFromISOString,
  allow_grade_left_ms: z.coerce.number(),
  allow_grade_interval: z.string(),
});

/**
 * Save a new submission to a variant into the database.
 *
 * @param {Object} submission - The submission to save (should not have an id property yet).
 * @param {Object} variant - The variant to submit to.
 * @param {Object} question - The question for the variant.
 * @param {Object} variant_course - The course for the variant.
 * @returns {Promise<string>} submission_id
 */
export async function saveSubmissionAsync(submission, variant, question, variant_course) {
  submission.raw_submitted_answer = submission.submitted_answer;
  submission.gradable = true;

  // if workspace, get workspace_id
  if (question.workspace_image != null) {
    const workspace_id = await sqldb.queryOptionalRow(
      sql.select_workspace_id,
      { variant_id: submission.variant_id },
      IdSchema,
    );
    // if we have a workspace and any files to be graded, get the files
    if (workspace_id != null && question.workspace_graded_files?.length) {
      try {
        const zipPath = await workspaceHelper.getGradedFiles(workspace_id);

        // if we have workspace files, encode them into _files
        if (zipPath != null) {
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
        }
      } catch (err) {
        if (err instanceof workspaceHelper.SubmissionFormatError) {
          ((submission.format_errors ??= {})._files ??= []).push(err.message);
        } else {
          throw err;
        }
      }
    }
  }

  const questionModule = questionServers.getModule(question.type);
  const question_course = await getQuestionCourse(question, variant_course);
  const { courseIssues, data } = await questionModule.parse(
    submission,
    variant,
    question,
    question_course,
  );

  const studentMessage = 'Error parsing submission';
  const courseData = { variant, question, submission, course: variant_course };
  await writeCourseIssues(
    courseIssues,
    variant,
    submission.auth_user_id,
    studentMessage,
    courseData,
  );

  const hasFatalIssue = courseIssues.some((issue) => issue.fatal);

  const submission_id = await sqldb.callRow(
    'submissions_insert',
    [
      data.submitted_answer,
      data.raw_submitted_answer,
      data.format_errors,
      data.gradable && !hasFatalIssue,
      hasFatalIssue,
      data.true_answer,
      data.feedback,
      false, // regradable
      submission.credit,
      submission.mode,
      submission.variant_id,
      submission.auth_user_id,
      submission.client_fingerprint_id,
    ],
    IdSchema,
  );
  return submission_id;
}
export const saveSubmission = util.callbackify(saveSubmissionAsync);

/**
 * Grade the most recent submission for a given variant.
 *
 * @param {Object} variant - The variant to grade.
 * @param {string | null} check_submission_id - The submission_id that must be graded (or null to skip this check).
 * @param {Object} question - The question for the variant.
 * @param {Object} variant_course - The course for the variant.
 * @param {string | null} authn_user_id - The currently authenticated user.
 * @param {boolean} overrideGradeRateCheck - Whether to override grade rate limits.
 * @returns {Promise<void>}
 */
export async function gradeVariantAsync(
  variant,
  check_submission_id,
  question,
  variant_course,
  authn_user_id,
  overrideGradeRateCheck,
) {
  const question_course = await getQuestionCourse(question, variant_course);

  const submission = await sqldb.callOptionalRow(
    'variants_select_submission_for_grading',
    [variant.id, check_submission_id],
    SubmissionSchema,
  );
  if (submission == null) return;

  if (!overrideGradeRateCheck) {
    const resultNextAllowed = await sqldb.callRow(
      'instance_questions_next_allowed_grade',
      [variant.instance_question_id],
      NextAllowedGradeSchema,
    );
    if (resultNextAllowed.allow_grade_left_ms > 0) return;
  }

  const grading_job = await sqldb.callRow(
    'grading_jobs_insert',
    [submission.id, authn_user_id],
    GradingJobSchema,
  );

  if (question.grading_method === 'External') {
    // For external grading we just need to trigger the grading job to start.
    // We haven't actually graded this question yet - don't attempt
    // to update the grading job or submission.
    await externalGrader.beginGradingJob(grading_job.id);
  } else {
    // For Internal grading we call the grading code. For Manual grading, if the question
    // reached this point, it has auto points, so it should be treated like Internal.
    const questionModule = questionServers.getModule(question.type);
    const { courseIssues, data } = await questionModule.grade(
      submission,
      variant,
      question,
      question_course,
    );
    const hasFatalIssue = courseIssues.some((issue) => issue.fatal);

    const studentMessage = 'Error grading submission';
    const courseData = { variant, question, submission, course: variant_course };
    await writeCourseIssues(
      courseIssues,
      variant,
      submission.auth_user_id,
      studentMessage,
      courseData,
    );

    const grading_job_post_update = await sqldb.callRow(
      'grading_jobs_update_after_grading',
      [
        grading_job.id,
        // `received_time` and `start_time` were already set when the
        // grading job was inserted, so they'll remain unchanged.
        // `finish_time` will be set to `now()` by this sproc.
        null, // received_time
        null, // start_time
        null, // finish_time
        data.submitted_answer,
        data.format_errors,
        data.gradable && !hasFatalIssue,
        hasFatalIssue, // broken
        data.params,
        data.true_answer,
        data.feedback,
        data.partial_scores,
        data.score,
        data.v2_score,
      ],
      GradingJobSchema,
    );

    // If the submission was marked invalid during grading the grading
    // job will be marked ungradable and we should bail here to prevent
    // LTI updates.
    if (!grading_job_post_update.gradable) return;

    const assessment_instance_id = await sqldb.queryOptionalRow(
      sql.select_assessment_for_submission,
      { submission_id: submission.id },
      IdSchema.nullable(),
    );
    if (assessment_instance_id != null) {
      await ltiOutcomes.updateScoreAsync(assessment_instance_id);
    }
  }
}
export const gradeVariant = util.callbackify(gradeVariantAsync);

/**
 * Save and grade a new submission to a variant.
 *
 * @param {Object} submission - The submission to save (should not have an id property yet).
 * @param {Object} variant - The variant to submit to.
 * @param {Object} question - The question for the variant.
 * @param {Object} course - The course for the variant.
 * @param {boolean} overrideGradeRateCheck - Whether to override grade rate limits.
 * @returns {Promise<string>} submission_id
 */
export async function saveAndGradeSubmissionAsync(
  submission,
  variant,
  question,
  course,
  overrideGradeRateCheck,
) {
  const submission_id = await saveSubmissionAsync(submission, variant, question, course);
  await gradeVariantAsync(
    variant,
    submission_id,
    question,
    course,
    submission.auth_user_id,
    overrideGradeRateCheck,
  );
  return submission_id;
}
export const saveAndGradeSubmission = util.callbackify(saveAndGradeSubmissionAsync);
