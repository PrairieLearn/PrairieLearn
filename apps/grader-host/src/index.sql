-- BLOCK check_job_cancellation
SELECT
  (grading_request_canceled_at IS NOT NULL) AS canceled
FROM
  grading_jobs
WHERE
  id = $grading_job_id;
