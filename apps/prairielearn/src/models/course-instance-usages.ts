/**
 * Usage data in the `course_instance_usages` table is designed only for
 * tracking billing information, not for general usage information that might be
 * of use to instructors, for example. This specialized use case means that:
 * 1. We can determine the number of unique users for any historical date range,
 *    with daily resolution. We don't have higher temporal resolution because
 *    it's not necessary for billing.
 * 2. We don't worry too much about tracking the exact `user_id` associated with
 *    compute usage (external grading jobs and workspaces). This is because it's
 *    more convenient to use the `variants.authn_user_id` rather than trying to
 *    track the effective `user_id`, and because we don't really care exactly
 *    which user is associated with the usage. The only reason we track
 *    `user_id` at all for this to allow per-user rows (rather than
 *    per-course-instance rows) to avoid contention when many users are updating
 *    simultaneously.
 *
 * In the `course_instance_usages` table, we store some rows with a
 * `course_instance_id` and some with only a `course_id`. The latter are for
 * course staff accessing questions outside of the context of a course instance.
 * This means that a course staff member might have two rows recorded for them,
 * one with a `course_instance_id` and one without, but this is ok because all
 * of our billing queries will either count distinct `user_id`s or sum the
 * `duration` for compute usage.
 */

import type { GenerateObjectResult, LanguageModelUsage } from 'ai';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import type { CounterClockwiseRotationDegrees } from '../ee/lib/ai-grading/types.js';
import { calculateResponseCost } from '../lib/ai-util.js';
import type { Config, config } from '../lib/config.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Update the course instance usages for a submission.
 * @param param
 * @param param.submission_id The ID of the submission.
 * @param param.user_id The user ID of the submission.
 */
export async function updateCourseInstanceUsagesForSubmission({
  submission_id,
  user_id,
}: {
  submission_id: string;
  user_id: string;
}) {
  await execute(sql.update_course_instance_usages_for_submission, {
    submission_id,
    user_id,
  });
}

/**
 * Update the course instance usages for external grading job.
 *
 * @param param
 * @param param.grading_job_id The ID of the grading job.
 */
export async function updateCourseInstanceUsagesForGradingJob({
  grading_job_id,
}: {
  grading_job_id: string;
}) {
  await execute(sql.update_course_instance_usages_for_external_grading, {
    grading_job_id,
  });
}

/**
 * Update the course instance usages for an AI question generation prompt.
 *
 * @param param
 * @param param.courseId The ID of the course.
 * @param param.authnUserId The ID of the user who generated the prompt.
 * @param param.model The model used for the prompt.
 * @param param.usage The usage object returned by the model provider's API.
 */
export async function updateCourseInstanceUsagesForAiQuestionGeneration({
  courseId,
  authnUserId,
  model,
  usage,
}: {
  courseId: string;
  authnUserId: string;
  model: keyof (typeof config)['costPerMillionTokens'];
  usage: LanguageModelUsage | undefined;
}) {
  await execute(sql.update_course_instance_usages_for_ai_question_generation, {
    course_id: courseId,
    authn_user_id: authnUserId,
    cost_ai_question_generation: calculateResponseCost({ model, usage }),
  });
}

/**
 * Update the course instance usages for an AI grading prompt.
 *
 * @param param
 * @param param.gradingJobId The ID of the grading job associated with the AI grading.
 * @param param.authnUserId The ID of the user who initiated the grading.
 * @param param.model The model used for the prompt.
 * @param param.usage The usage object returned by model provider's API.
 */
async function updateCourseInstanceUsagesForAiGrading({
  gradingJobId,
  authnUserId,
  model,
  usage,
}: {
  gradingJobId: string;
  authnUserId: string;
  model: keyof Config['costPerMillionTokens'];
  usage: LanguageModelUsage | undefined;
}) {
  await execute(sql.update_course_instance_usages_for_ai_grading, {
    grading_job_id: gradingJobId,
    authn_user_id: authnUserId,
    cost_ai_grading: calculateResponseCost({ model, usage }),
  });
}

export async function updateCourseInstanceUsagesForAiGradingResponses({
  gradingJobId,
  authnUserId,
  model,
  gradingResponseWithRotationIssue,
  rotationCorrections,
  finalGradingResponse,
}: {
  gradingJobId: string;
  authnUserId: string;
  model: keyof Config['costPerMillionTokens'];
  gradingResponseWithRotationIssue?: GenerateObjectResult<any>;
  rotationCorrections?: Record<
    string,
    {
      degreesRotated: CounterClockwiseRotationDegrees;
      response: GenerateObjectResult<any>;
    }
  >;
  finalGradingResponse: GenerateObjectResult<any>;
}) {
  const responses = [
    ...(gradingResponseWithRotationIssue ? [gradingResponseWithRotationIssue] : []),
    ...(rotationCorrections
      ? Object.values(rotationCorrections).map((correction) => correction.response)
      : []),
    finalGradingResponse,
  ];

  for (const response of responses) {
    await updateCourseInstanceUsagesForAiGrading({
      gradingJobId,
      authnUserId,
      model,
      usage: response.usage,
    });
  }
}
