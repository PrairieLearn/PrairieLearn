import * as fs from 'fs';

import * as unzipper from 'unzipper';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { IdSchema, IntervalSchema } from '@prairielearn/zod';

import { updateCourseInstanceUsagesForSubmission } from '../models/course-instance-usages.js';
import { insertGradingJob, updateGradingJobAfterGrading } from '../models/grading-job.js';
import { computeNextAllowedGradingTimeMs } from '../models/instance-question.js';
import { lockVariant } from '../models/variant.js';
import * as questionServers from '../question-servers/index.js';

import { ensureChunksForCourseAsync } from './chunks.js';
import {
  AssessmentQuestionSchema,
  type Course,
  InstanceQuestionSchema,
  type Question,
  QuestionSchema,
  type Submission,
  SubmissionSchema,
  type Variant,
  VariantSchema,
} from './db-types.js';
import * as externalGrader from './externalGrader.js';
import { idsEqual } from './id.js';
import { writeCourseIssues } from './issues.js';
import * as ltiOutcomes from './ltiOutcomes.js';
import { updateInstanceQuestionStats } from './question-points.js';
import { getQuestionCourse } from './question-variant.js';
import * as workspaceHelper from './workspace.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const VariantDataSchema = z.object({
  grading_method: QuestionSchema.shape.grading_method,
  // These fields are only present when the variant is associated with an
  // instance question (and thus an assessment).
  instance_question_id: InstanceQuestionSchema.shape.id.nullable(),
  max_auto_points: AssessmentQuestionSchema.shape.max_auto_points.nullable(),
  max_manual_points: AssessmentQuestionSchema.shape.max_manual_points.nullable(),
  allow_real_time_grading: AssessmentQuestionSchema.shape.allow_real_time_grading.nullable(),
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
    user_id: string;
  };

async function insertSubmission({
  submitted_answer,
  raw_submitted_answer,
  format_errors,
  gradable,
  broken,
  params,
  true_answer,
  feedback,
  credit,
  mode,
  variant_id,
  user_id,
  auth_user_id,
  client_fingerprint_id,
}: {
  submitted_answer: Record<string, any> | null;
  raw_submitted_answer: Record<string, any> | null;
  format_errors: Record<string, any> | null;
  gradable: boolean | null;
  broken: boolean | null;
  params: Record<string, any> | null;
  true_answer: Record<string, any> | null;
  feedback: Record<string, any> | null;
  credit?: number | null;
  mode?: Submission['mode'];
  variant_id: string;
  user_id: string;
  auth_user_id: string | null;
  client_fingerprint_id?: string | null;
}): Promise<{ submission_id: string; variant: Variant }> {
  return await sqldb.runInTransactionAsync(async () => {
    await lockVariant({ variant_id });

    // Select the variant, while updating the variant's `params` and
    // `correct_answer`, which is permitted to change during the `parse` phase
    // (which occurs before this submission is inserted).
    //
    // Note that we do this mutation as part of the selection process to avoid another
    // database round trip. This mutation is safe to do before the access checks below
    // because if they fail, the transaction will be rolled back and the variant will
    // not be updated.
    const variant = await sqldb.queryRow(
      sql.update_variant_true_answer,
      { variant_id, params, true_answer },
      VariantForSubmissionSchema,
    );

    if (variant.broken_at != null) {
      throw new error.AugmentedError('Variant is broken', { status: 400, data: { variant_id } });
    }

    if (!variant.open) {
      throw new error.AugmentedError('Variant is not open', { status: 403, data: { variant_id } });
    }
    if (variant.instance_question_id != null && !variant.instance_question_open) {
      throw new error.AugmentedError('Instance question is not open', {
        status: 403,
        data: { variant_id },
      });
    }
    if (variant.assessment_instance_id != null && !variant.assessment_instance_open) {
      throw new error.AugmentedError('Assessment instance is not open', {
        status: 403,
        data: { variant_id },
      });
    }

    const delta = await sqldb.queryOptionalRow(
      sql.select_and_update_last_access,
      { user_id: variant.user_id, group_id: variant.team_id },
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
        params,
        true_answer,
        feedback,
        gradable,
        broken,
        client_fingerprint_id,
      },
      IdSchema,
    );

    await updateCourseInstanceUsagesForSubmission({ submission_id, user_id });

    if (variant.instance_question_id != null) {
      const instanceQuestion = await sqldb.queryRow(
        sql.update_instance_question_post_submission,
        {
          instance_question_id: variant.instance_question_id,
          assessment_instance_id: variant.assessment_instance_id,
          delta,
          status: gradable ? 'saved' : 'invalid',
          requires_manual_grading: (variant.max_manual_points ?? 0) > 0,
        },
        InstanceQuestionSchema,
      );
      await updateInstanceQuestionStats({ instanceQuestion });
    }

    return { submission_id, variant };
  });
}

/**
 * Save a new submission to a variant into the database.
 *
 * @param submissionData - The submission to save (should not have an id property yet).
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
): Promise<{ submission_id: string; variant: Variant }> {
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

          // Up until this point, `raw_submitted_answer` was just a reference to
          // the `submitted_answer` object. If we naively wrote to
          // `submitted_answer._files`, we'd end up storing the files twice in
          // the database. To avoid this, we'll create a deep copy of
          // `raw_submitted_answer` to ensure that we don't end up with
          // duplicate file entries.
          submission.raw_submitted_answer = structuredClone(submission.raw_submitted_answer);

          if (!('_files' in submission.submitted_answer)) {
            submission.submitted_answer._files = [];
          }

          for await (const zipEntry of zip) {
            const name = zipEntry.path;
            const contents = (await zipEntry.buffer()).toString('base64');
            submission.submitted_answer._files.push({ name, contents });
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
    submission.user_id,
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
  ignoreRealTimeGradingDisabled: boolean,
): Promise<Submission | null> {
  return sqldb.runInTransactionAsync(async () => {
    await lockVariant({ variant_id });

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

    // Unlike the above, we can't rely solely on the UI and POST handlers to prevent
    // students from grading questions with real-time grading disabled. This is
    // because the "Grade N saved answers" button can be used without closing the
    // assessment, so we must explicitly skip questions where real-time grading is disabled.
    if (
      variantData.instance_question_id != null &&
      variantData.allow_real_time_grading === false &&
      !ignoreRealTimeGradingDisabled
    ) {
      return null;
    }

    // Select the most recent submission
    const submission = await sqldb.queryOptionalRow(
      sql.select_last_submission_of_variant,
      { variant_id },
      SubmissionSchema,
    );
    if (submission == null) return null;

    if (check_submission_id != null && !idsEqual(submission.id, check_submission_id)) {
      throw new error.AugmentedError('Submission ID mismatch', {
        status: 400,
        data: {
          submission_id: submission.id,
          check_submission_id,
        },
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
 * @param params
 * @param params.variant - The variant to grade.
 * @param params.check_submission_id - The submission_id that must be graded (or null to skip this check).
 * @param params.question - The question for the variant.
 * @param params.variant_course - The course for the variant.
 * @param params.user_id - The current effective user.
 * @param params.authn_user_id - The currently authenticated user.
 * @param params.ignoreGradeRateLimit - Whether to ignore grade rate limits.
 * @param params.ignoreRealTimeGradingDisabled - Whether to ignore real-time grading disabled checks.
 */
export async function gradeVariant({
  variant,
  check_submission_id,
  question,
  variant_course,
  user_id,
  authn_user_id,
  ignoreGradeRateLimit,
  ignoreRealTimeGradingDisabled,
}: {
  variant: Variant;
  check_submission_id: string | null;
  question: Question;
  variant_course: Course;
  user_id: string | null;
  authn_user_id: string | null;
  ignoreGradeRateLimit: boolean;
  ignoreRealTimeGradingDisabled: boolean;
}): Promise<void> {
  const question_course = await getQuestionCourse(question, variant_course);

  const submission = await selectSubmissionForGrading(
    variant.id,
    check_submission_id,
    ignoreRealTimeGradingDisabled,
  );
  if (submission == null) return;

  if (!ignoreGradeRateLimit && variant.instance_question_id != null) {
    const nextGradingAllowedMs = await computeNextAllowedGradingTimeMs({
      instanceQuestionId: variant.instance_question_id,
    });
    if (nextGradingAllowedMs > 0) return;
  }

  const grading_job = await insertGradingJob({ submission_id: submission.id, authn_user_id });

  if (question.grading_method === 'External') {
    // For external grading we just need to trigger the grading job to start.
    // We haven't actually graded this question yet - don't attempt
    // to update the grading job or submission.
    //
    // Before starting the grading process, we need to ensure that any relevant
    // chunks are available on disk. This uses the same list of chunks as
    // `getContext` in `freeform.js`. We technically probably don't need to
    // load element and element extension chunks, but we do so anyway to be
    // consistent with the other code path.
    await ensureChunksForCourseAsync(question_course.id, [
      { type: 'question', questionId: question.id },
      { type: 'clientFilesCourse' },
      { type: 'serverFilesCourse' },
      { type: 'elements' },
      { type: 'elementExtensions' },
    ]);
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
      user_id,
      submission.auth_user_id,
      studentMessage,
      courseData,
    );

    const grading_job_post_update = await updateGradingJobAfterGrading({
      grading_job_id: grading_job.id,
      // `received_time` and `start_time` were already set when the
      // grading job was inserted, so they'll remain unchanged.
      // `finish_time` will be set to `now()` by this function.
      submitted_answer: data.submitted_answer,
      format_errors: data.format_errors,
      gradable: !!data.gradable && !hasFatalIssue,
      broken: hasFatalIssue,
      params: data.params,
      true_answer: data.true_answer,
      feedback: data.feedback,
      partial_scores: data.partial_scores,
      score: data.score,
      v2_score: data.v2_score,
    });

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
      await ltiOutcomes.updateScore(assessment_instance_id);
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
 * @param ignoreGradeRateLimit - Whether to ignore grade rate limits.
 * @param ignoreRealTimeGradingDisabled - Whether to ignore real-time grading disabled checks.
 * @returns submission_id
 */
export async function saveAndGradeSubmission(
  submissionData: SubmissionDataForSaving,
  variant: Variant,
  question: Question,
  course: Course,
  ignoreGradeRateLimit: boolean,
  ignoreRealTimeGradingDisabled: boolean,
) {
  const { submission_id, variant: updated_variant } = await saveSubmission(
    submissionData,
    variant,
    question,
    course,
  );

  await gradeVariant({
    // Note that parsing a submission may modify the `params` and `true_answer`
    // of the variant (for v3 questions, this is `data["params"]` and
    // `data["correct_answers"])`. This is why we need to use the variant
    // returned from `saveSubmission` rather than the one passed to this
    // function.
    variant: updated_variant,
    check_submission_id: submission_id,
    question,
    variant_course: course,
    user_id: submissionData.user_id,
    authn_user_id: submissionData.auth_user_id,
    ignoreGradeRateLimit,
    ignoreRealTimeGradingDisabled,
  });
  return submission_id;
}
