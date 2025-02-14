-- BLOCK select_grading_job
SELECT
  *
FROM
  grading_jobs
WHERE
  id = $grading_job_id;
