-- BLOCK select_job
SELECT
  job_sequence_id,
  start_date,
  finish_date,
  status,
  output
FROM
  jobs
WHERE
  course_id = $course_id
  AND job_sequence_id = $job_sequence_id
  AND type = 'sync';
