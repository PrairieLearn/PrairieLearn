-- BLOCK update_job_output
UPDATE grading_jobs
SET
  output = $output
WHERE
  id = $grading_job_id
