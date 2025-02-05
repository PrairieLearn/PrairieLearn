import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);

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
  await sqldb.queryAsync(sql.update_course_instance_usages_for_submission, {
    submission_id,
    user_id,
  });
}

/**
 * Update the course instance usages for exernal grading job.
 *
 * @param param.grading_job_id The ID of the grading job.
 * @param param.user_id The user ID of the submission.
 */
export async function updateCourseInstanceUsagesForGradingJob({
  grading_job_id,
  user_id,
}: {
  grading_job_id: string;
  user_id: string;
}) {
  await sqldb.queryAsync(sql.update_course_instance_usages_for_grading_job, {
    grading_job_id,
    user_id,
  });
}

/**
 * Update the course instance usages for workspace usage.
 *
 * @param param.workspace_id The ID of the workspace.
 * @param param.user_id The user ID of the submission.
 */
export async function updateCourseInstanceUsagesForWorkspaceUsage({
  workspace_id,
  user_id,
}: {
  workspace_id: string;
  user_id: string;
}) {
  await sqldb.queryAsync(sql.update_course_instance_usages_for_workspace_usage, {
    workspace_id,
    user_id,
  });
}
