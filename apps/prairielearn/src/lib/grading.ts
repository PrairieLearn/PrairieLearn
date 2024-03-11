import * as fs from 'fs';
import * as unzipper from 'unzipper';
import { z } from 'zod';

import * as error from '@prairielearn/error';

import * as externalGrader from './externalGrader';
import * as ltiOutcomes from './ltiOutcomes';
import { writeCourseIssues } from './issues';
import { getQuestionCourse } from './question-variant';
import * as sqldb from '@prairielearn/postgres';
import * as questionServers from '../question-servers';
import * as workspaceHelper from './workspace';
import {
  Course,
  DateFromISOString,
  GradingJobSchema,
  IdSchema,
  IntervalSchema,
  Question,
  QuestionSchema,
  Submission,
  SubmissionSchema,
  Variant,
  VariantSchema,
} from './db-types';
import { idsEqual } from './id';

const sql = sqldb.loadSqlEquiv(__filename);

const NextAllowedGradeSchema = z.object({
  allow_grade_date: DateFromISOString.nullable(),
  allow_grade_left_ms: z.coerce.number(),
  allow_grade_interval: z.string(),
});

const VariantDataSchema = z.object({
  instance_question_id: z.string().nullable(),
  grading_method: QuestionSchema.shape.grading_method,
  max_auto_points: z.number().nullable(),
  max_manual_points: z.number().nullable(),
});

const VariantForSubmissionSchema = VariantSchema.extend({
  assessment_instance_id: z.string().nullable(),
  max_manual_points: z.number().nullable(),
  instance_question_open: z.boolean().nullable(),
  assessment_instance_open: z.boolean().nullable(),
});

type SubmissionDataForSaving = Pick<Submission, 'variant_id' | 'auth_user_id'> &
  Pick<Partial<Submission>, 'credit' | 'mode' | 'client_fingerprint_id'> & {
    submitted_answer: NonNullable<Submission['submitted_answer']>;
  };

export async function insertSubmission({
  submitted_answer,
  raw_submitted_answer,
  format_errors,
  gradable,
  broken,
  true_answer,
  feedback,
  credit,
  mode,
  variant_id,
  auth_user_id,
  client_fingerprint_id,
}: {
  submitted_answer: Record<string, any> | null;
  raw_submitted_answer: Record<string, any> | null;
  format_errors: Record<string, any> | null;
  gradable: boolean | null;
  broken: boolean | null;
  true_answer: Record<string, any> | null;
  feedback: Record<string, any> | null;
  credit?: number | null;
  mode?: Submission['mode'];
  variant_id: string;
  auth_user_id: string | null;
  client_fingerprint_id?: string | null;
}): Promise<string> {
  return await sqldb.runInTransactionAsync(async () => {
    await sqldb.callAsync('variants_lock', [variant_id]);

    // Select the variant, while updating the variant's `correct_answer`, which
    // is permitted to change during the `parse` phase (which occurs before this
    // submission is inserted).
    const variant = await sqldb.queryRow(
      sql.update_variant_true_answer,
      { variant_id, true_answer },
      VariantForSubmissionSchema,
    );

    if (variant.broken_at != null) {
      throw error.make(400, 'Variant is broken', { variant_id });
    }

    if (!variant.open) {
      throw error.make(403, 'Variant is not open', { variant_id });
    }
    if (variant.instance_question_id != null && !variant.instance_question_open) {
      throw error.make(403, 'Instance question is not open', { variant_id });
    }
    if (variant.assessment_instance_id != null && !variant.assessment_instance_open) {
      throw error.make(403, 'Assessment instance is not open', { variant_id });
    }

    const delta = await sqldb.queryOptionalRow(
      sql.select_and_update_last_access,
      { user_id: variant.user_id, group_id: variant.group_id },
      IntervalSchema.nullable(),
    );

    const submission_id = await sqldb.queryRow(
      sql.insert_submission,
      {
        variant_id,
        auth_user_id,
        raw_submitted_answer,
        submitted_answer,
        format_errors,
        credit,
        mode,
        delta,
        params: variant.params,
        true_answer,
        feedback,
        gradable,
        broken,
        client_fingerprint_id,
      },
      IdSchema,
    );

    if (variant.assessment_instance_id != null) {
      await sqldb.queryAsync(sql.update_instance_question_post_submission, {
        instance_question_id: variant.instance_question_id,
        assessment_instance_id: variant.assessment_instance_id,
        delta,
        status: gradable ? 'saved' : 'invalid',
        requires_manual_grading: (variant.max_manual_points ?? 0) > 0,
      });
      await sqldb.callAsync('instance_questions_calculate_stats', [variant.instance_question_id]);
    }

    return submission_id;
  });
}

/**
 * Save a new submission to a variant into the database.
 *
 * @param submission - The submission to save (should not have an id property yet).
 * @param variant - The variant to submit to.
 * @param question - The question for the variant.
 * @param variant_course - The course for the variant.
 * @returns submission_id
 */
export async function saveSubmission(
  submissionData: SubmissionDataForSaving,
  variant: Variant,
  question: Question,
  variant_course: Course,
): Promise<string> {
  const submission: Partial<Submission> & SubmissionDataForSaving = {
    ...submissionData,
    raw_submitted_answer: submissionData.submitted_answer,
    gradable: true,
  };

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

  return await insertSubmission({
    ...submission,
    ...data,
    gradable: !!data.gradable && !hasFatalIssue,
    broken: hasFatalIssue,
  });
}

async function selectSubmissionForGrading(
  variant_id: string,
  check_submission_id: string | null,
): Promise<Submission | null> {
  return sqldb.runInTransactionAsync(async () => {
    await sqldb.callAsync('variants_lock', [variant_id]);

    const variantData = await sqldb.queryOptionalRow(
      sql.select_variant_data,
      { variant_id },
      VariantDataSchema,
    );
    if (variantData == null) return null;

    // We only select variants that will be auto-graded, so ignore this variant
    // if this is manual grading only. Typically we would not reach this point
    // for these cases, since the grade button is not shown to students, so this
    // is an extra precaution.
    if (variantData.instance_question_id == null) {
      if (variantData.grading_method === 'Manual') return null;
    } else {
      if ((variantData.max_auto_points ?? 0) === 0 && (variantData.max_manual_points ?? 0) !== 0) {
        return null;
      }
    }

    // Select the most recent submission
    const submission = await sqldb.queryOptionalRow(
      sql.select_last_submission_of_variant,
      { variant_id },
      SubmissionSchema,
    );
    if (submission == null) return null;

    if (check_submission_id != null && !idsEqual(submission.id, check_submission_id)) {
      throw error.make(400, 'Submission ID mismatch', {
        submission_id: submission.id,
        check_submission_id,
      });
    }

    // Check if the submission needs grading
    if (
      submission.score != null || // already graded
      submission.grading_requested_at != null || // grading is in progress
      submission.broken || // submission is broken
      !submission.gradable // submission did not pass parsing
    ) {
      return null;
    }

    return submission;
  });
}

/**
 * Grade the most recent submission for a given variant.
 *
 * @param variant - The variant to grade.
 * @param check_submission_id - The submission_id that must be graded (or null to skip this check).
 * @param question - The question for the variant.
 * @param variant_course - The course for the variant.
 * @param authn_user_id - The currently authenticated user.
 * @param overrideGradeRateCheck - Whether to override grade rate limits.
 */
export async function gradeVariant(
  variant: Variant,
  check_submission_id: string | null,
  question: Question,
  variant_course: Course,
  authn_user_id: string | null,
  overrideGradeRateCheck: boolean,
): Promise<void> {
  const question_course = await getQuestionCourse(question, variant_course);

  const submission = await selectSubmissionForGrading(variant.id, check_submission_id);
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
        !!data.gradable && !hasFatalIssue, // gradable
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

/**
 * Save and grade a new submission to a variant.
 *
 * @param submissionData - The submission to save (should not have an id property yet).
 * @param variant - The variant to submit to.
 * @param question - The question for the variant.
 * @param course - The course for the variant.
 * @param overrideGradeRateCheck - Whether to override grade rate limits.
 * @returns submission_id
 */
export async function saveAndGradeSubmission(
  submissionData: SubmissionDataForSaving,
  variant: Variant,
  question: Question,
  course: Course,
  overrideGradeRateCheck: boolean,
) {
  const submission_id = await saveSubmission(submissionData, variant, question, course);
  await gradeVariant(
    variant,
    submission_id,
    question,
    course,
    submissionData.auth_user_id,
    overrideGradeRateCheck,
  );
  return submission_id;
}
