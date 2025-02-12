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
