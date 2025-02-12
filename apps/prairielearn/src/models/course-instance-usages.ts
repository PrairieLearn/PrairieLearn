/**
 * Usage date in the `course_instance_usages` table is designed only for
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
 */

import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Update the course instance usages for a submission.
 *
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
  await queryAsync(sql.update_course_instance_usages_for_submission, {
    submission_id,
    user_id,
  });
}

/**
 * Update the course instance usages for exernal grading job.
 *
 * @param param.grading_job_id The ID of the grading job.
 */
export async function updateCourseInstanceUsagesForGradingJob({
  grading_job_id,
}: {
  grading_job_id: string;
}) {
  await queryAsync(sql.update_course_instance_usages_for_external_grading, {
    grading_job_id,
  });
}
