-- BLOCK select_job
SELECT
    grading_requested_at,
    grading_request_canceled_at,
    graded_at,
    grading_submitted_at,
    grading_started_at,
    grading_finished_at
FROM
    grading_jobs
WHERE
    id = $grading_job_id
